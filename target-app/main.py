from fastapi import FastAPI , HTTPException
from pydantic import BaseModel
from dotenv import load_dotenv
import os

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
        raise HTTPException(status_code=500, detail="REQUIRED_API_KEY is not set in the environment variables.")
    
    return {"status": "configured"}

