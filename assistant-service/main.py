from fastapi import FastAPI, HTTPException
import docker

import os
from dotenv import load_dotenv
import json
from google import genai
from google.genai import types


load_dotenv()
app = FastAPI()
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
    } for c in containers 

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

DIAGNOSIS_PROMPT = """You are a DevOps incident diagnosis assistant. You will be given raw data about a Docker container: its exit code, whether it was OOM-killed, and its logs.

Classify the failure into exactly one of these categories:
- "missing_or_bad_env_var": app raised an error referencing missing/invalid configuration
- "oom_kill": exit_code is 137 and oom_killed is true, typically with sparse or empty logs
- "unreachable_dependency": logs show a connection/DNS error to another service
- "healthy": no failure, container is running normally
- "uncertain": evidence is insufficient or doesn't clearly match any category above

Container data:
Exit code: {exit_code}
OOM killed: {oom_killed}
Status: {status}
Logs:
{logs}
"""

DIAGNOSIS_SCHEMA = {
    "type": "object",
    "properties": {
        "failure_type": {
            "type": "string",
            "enum": ["missing_or_bad_env_var", "oom_kill", "unreachable_dependency", "healthy", "uncertain"],
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

    prompt = DIAGNOSIS_PROMPT.format(exit_code=exit_code,
                                    oom_killed=oom_killed, 
                                    status=status,
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

    return {
        "container_id": container.short_id,
        "diagnosis": diagnosis,
        "name": container.name
    }