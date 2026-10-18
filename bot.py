import os
import sys
# pyrefly: ignore [missing-import]
from google import genai

# Securely load the API key from environment variables
api_key = os.environ.get("GEMINI_API_KEY")

if not api_key:
    print("Error: GEMINI_API_KEY environment variable not set.")
    sys.exit(1)

# Determine model to use
model_name = os.environ.get("GEMINI_MODEL", "gemini-3.5-flash")

# Initialize the client
client = genai.Client(api_key=api_key)

# Start a chat session using the standard model
chat = client.chats.create(model=model_name)

print(f"🤖 Gemini Bot Initialized ({model_name})! Type 'quit' or 'exit' to stop.")
print("-" * 50)

while True:
    try:
        user_input = input("You: ")
        if user_input.lower() in ['quit', 'exit']:
            print("Goodbye!")
            break
            
        # Send the message to Gemini and get the response
        response = chat.send_message(user_input)
        print(f"Gemini: {response.text}\n")
        
    except KeyboardInterrupt:
        print("\nGoodbye!")
        break
    except Exception as e:
        print(f"An error occurred: {e}")