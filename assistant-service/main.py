from fastapi import FastAPI, HTTPException
import docker
from database import init_db, SessionLocal, Incident
import os
from dotenv import load_dotenv
import json
from google import genai
from google.genai import types
import requests

GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")
GITHUB_REPO = os.getenv("GITHUB_REPO")


load_dotenv()
app = FastAPI()
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)
init_db()
client = docker.from_env()
ai_client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))


@app.get("/health")
def health_check():
    return {"status": "healthy"}

@app.get("/containers")
def get_containers():
    containers = client.containers.list(all=True)
    return [{
        "id": c.short_id,
        "name": c.name,
        "status": c.status,
        "image": c.image.tags[0] if c.image.tags else "unknown"
    } for c in containers if c.image.tags and "target-app" in c.image.tags[0]

    ]

@app.get("/logs/{container_id}")
def get_container_logs(container_id: str):
    try:
        container = client.containers.get(container_id)
    except docker.errors.NotFound:
        raise HTTPException(status_code=404, detail="Container not found")

    logs = container.logs(tail=200).decode('utf-8', errors='replace')
    exit_code = None
    oom_killed = None

    container.reload()

    state = container.attrs.get('State', {})
    exit_code = state.get('ExitCode')
    oom_killed = state.get('OOMKilled')

    return {
        "logs": logs,
        "exit_code": exit_code,
        "oom_killed": oom_killed,
        "name": container.name,
        "container_id": container.short_id,
        "status": container.status,
        
    }


DIAGNOSIS_PROMPT = """You are a DevOps incident diagnosis assistant. You will be given raw data about a Docker container (exit code, OOM status, logs) AND the status of the most recent CI/CD pipeline run.

Classify the failure into exactly one of these categories:
- "missing_or_bad_env_var": app raised an error referencing missing/invalid configuration
- "oom_kill": exit_code is 137 and oom_killed is true, typically with sparse or empty logs
- "unreachable_dependency": logs show a connection/DNS error to another service
- "ci_build_failure": the CI run/job/step data indicates the build or pipeline itself failed
- "healthy": no failure, container is running normally
- "uncertain": evidence is insufficient or doesn't clearly match any category above

Container data:
Exit code: {exit_code}
OOM killed: {oom_killed}
Status: {status}
Logs:
{logs}

CI/CD pipeline data:
{ci_summary}
"""

DIAGNOSIS_SCHEMA = {
    "type": "object",
    "properties": {
        "failure_type": {
            "type": "string",
            "enum": ["missing_or_bad_env_var", "oom_kill", "unreachable_dependency", "ci_build_failure", "healthy", "uncertain"],
            
        },
        "root_cause": {"type": "string"},
        "suggested_fix": {"type": "string"},
        "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
    },
    "required": ["failure_type", "root_cause", "suggested_fix", "confidence"],
}

@app.get("/diagnose/{container_id}")
def diagnose_container(container_id: str):
    try:
        container = client.containers.get(container_id)
    except docker.errors.NotFound:
        raise HTTPException(status_code=404, detail="Container not found")

    logs = container.logs(tail=200).decode('utf-8', errors='replace')
    container.reload()
    state = container.attrs.get('State', {})
    exit_code = state.get('ExitCode')
    oom_killed = state.get('OOMKilled')
    status = container.status
    ci_summary = get_latest_ci_run()

    prompt = DIAGNOSIS_PROMPT.format(exit_code=exit_code,
                                    oom_killed=oom_killed,
                                    status=status,
                                    ci_summary=ci_summary,
                                    logs=logs if logs.strip() else "No logs available")

    response = ai_client.models.generate_content(
        model="gemini-2.5-flash-lite",
        contents=prompt,
        config=types.GenerateContentConfig(
            temperature=0,
            response_mime_type="application/json",
            response_schema=DIAGNOSIS_SCHEMA,
        ),
    )

    try:
        diagnosis = json.loads(response.text)
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail=f"model returned invalid JSON {response.text}")

    db = SessionLocal()
    incident = Incident(
        container_id=container.short_id,
        container_name=container.name,
        failure_type=diagnosis.get("failure_type"),
        root_cause=diagnosis.get("root_cause"),
        suggested_fix=diagnosis.get("suggested_fix"),
        confidence=diagnosis.get("confidence"),
        raw_logs=logs,
    )
    db.add(incident)
    db.commit()
    db.close()

    return {
        "container_id": container.short_id,
        "diagnosis": diagnosis,
        "name": container.name
    }


@app.get("/incidents")
def list_incidents():
    db = SessionLocal()
    results = db.query(Incident).order_by(Incident.created_at.desc()).all()
    db.close()
    return [
        {
            "id": i.id,
            "container_name": i.container_name,
            "failure_type": i.failure_type,
            "root_cause": i.root_cause,
            "suggested_fix": i.suggested_fix,
            "confidence": i.confidence,
            "created_at": i.created_at.isoformat(),
        }
        for i in results
    ]

def get_latest_ci_run():
    """
    Fetches the most recent GitHub Actions workflow run and its jobs/steps,
    returning a plain-text summary of what happened — pass/fail per step.
    """
    if not GITHUB_TOKEN or not GITHUB_REPO:
        return "CI data unavailable (GITHUB_TOKEN or GITHUB_REPO not configured)."

    headers = {"Authorization": f"Bearer {GITHUB_TOKEN}"}

    runs_url = f"https://api.github.com/repos/{GITHUB_REPO}/actions/runs?per_page=1"
    runs_res = requests.get(runs_url, headers=headers, timeout=10)
    if runs_res.status_code != 200 or not runs_res.json().get("workflow_runs"):
        return "No CI runs found."

    latest_run = runs_res.json()["workflow_runs"][0]
    run_id = latest_run["id"]
    run_conclusion = latest_run["conclusion"]
    run_status = latest_run["status"]

    jobs_url = f"https://api.github.com/repos/{GITHUB_REPO}/actions/runs/{run_id}/jobs"
    jobs_res = requests.get(jobs_url, headers=headers, timeout=10)
    jobs_data = jobs_res.json().get("jobs", [])

    summary_lines = [f"Latest CI run: status={run_status}, conclusion={run_conclusion}"]
    for job in jobs_data:
        summary_lines.append(f"Job: {job['name']} — {job['conclusion']}")
        for step in job.get("steps", []):
            summary_lines.append(f"  Step: {step['name']} — {step['conclusion']}")

    return "\n".join(summary_lines)