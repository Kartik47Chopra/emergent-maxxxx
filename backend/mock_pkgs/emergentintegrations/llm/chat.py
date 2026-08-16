"""Mock emergentintegrations.llm.chat - provides stub classes so the backend starts without the private package."""

class UserMessage:
    def __init__(self, text="", **kwargs):
        self.text = text

class TextDelta:
    def __init__(self, content=""):
        self.content = content

class StreamDone:
    pass

class LlmChat:
    def __init__(self, api_key="", session_id="", system_message="", **kwargs):
        self.api_key = api_key
        self.session_id = session_id
        self.system_message = system_message

    def with_model(self, provider, model):
        return self

    async def stream_message(self, message):
        yield TextDelta(content="AI chat is unavailable in this deployment. Core features work normally.")
        yield StreamDone()
