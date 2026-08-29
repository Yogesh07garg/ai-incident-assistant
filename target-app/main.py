from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from dotenv import load_dotenv
import os
import httpx

app = FastAPI()

load_dotenv()

items = []

class Item(BaseModel):
    name: str
    value: int

@app.get("/")
def read_root():
    return {"message": "Welcome to the FastAPI application!"}

@app.get("/health")
def health_check():
    return {"status": "healthy"}

@app.post("/items")
def create_item(item: Item):
    items.append(item)
    return item

@app.get("/items")
def read_items():
    return items

@app.get("/config-check")
def config_check():
    required_vars = os.getenv("REQUIRED_API_KEY")
    if not required_vars:
        raise RuntimeError("REQUIRED_API_KEY environment variable is not set")
    return {"status": "configured"}

@app.get("/dependency-check")
def dependency_check():
    try:
        response = httpx.get("http://nonexistent-service:9999/status", timeout=3)
        return {"status": "ok", "response": response.status_code}
    except httpx.RequestError as e:
        raise RuntimeError(f"Failed to reach dependency: {e}")



print("hello world")