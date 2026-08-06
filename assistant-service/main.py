from fastapi import FastAPI, HTTPException
import docker

app = FastAPI()
client = docker.from_env()

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
    