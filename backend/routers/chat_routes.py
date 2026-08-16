import os
import json
import uuid

from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from emergentintegrations.llm.chat import LlmChat, UserMessage, TextDelta, StreamDone

from core import db, get_current_user, now_iso, logger

router = APIRouter()


class ChatIn(BaseModel):
    message: str


async def production_snapshot() -> str:
    doors = await db.doors.find({}, {"_id": 0, "door_id": 1, "floor": 1, "location": 1,
                                     "job_name": 1, "stages": 1}).to_list(1000)
    lines = []
    for d in doors:
        st = d["stages"]

        def m(k):
            return "Y" if st[k]["status"] == "completed" else "-"
        qc = st["routing"].get("qc") or ""
        fail_note = f" QC-FAIL({st['routing'].get('notes', '')})" if qc == "fail" else ""
        lines.append(f"{d['door_id']} [{d['floor']}|{d['location']}] core:{m('core')} skin:{m('skin')} "
                     f"asm:{m('assembly')} press:{m('press')} routing:{m('routing')}{qc and '/' + qc}"
                     f" despatch:{m('despatch')}{fail_note}")
    return "\n".join(lines)


@router.post("/chat")
async def chat(body: ChatIn, user=Depends(get_current_user)):
    msg = body.message.strip()
    if not msg:
        raise HTTPException(400, "Empty message")
    uid = user["id"]
    await db.chat_messages.insert_one({"user_id": uid, "role": "user", "content": msg, "at": now_iso()})
    history = await db.chat_messages.find({"user_id": uid}, {"_id": 0}).sort("at", -1).to_list(11)
    history.reverse()
    transcript = "\n".join(f"{'User' if h['role'] == 'user' else 'Assistant'}: {h['content']}" for h in history[:-1])
    snapshot = await production_snapshot()
    system = (
        "You are MAXX AI, the production assistant for MAXX DOORS, a fire-rated door factory. "
        "You have LIVE access to the factory's door data below. Stage flags: Y = completed, - = not done. "
        "Workflow order: core and skin (parallel) -> assembly -> press -> routing/QC -> despatch. "
        "Answer concisely, plainly, like a sharp production manager. Use door IDs exactly. "
        "If asked for next actions, respect the workflow order.\n\nLIVE DOOR DATA:\n" + (snapshot or "(no doors yet)")
    )
    prompt = f"Conversation so far:\n{transcript}\n\nUser: {msg}" if transcript else msg

    async def gen():
        full = ""
        try:
            chat_client = LlmChat(api_key=os.environ["EMERGENT_LLM_KEY"],
                                  session_id=f"{uid}-{uuid.uuid4()}", system_message=system
                                  ).with_model("openai", "gpt-5.4")
            async for ev in chat_client.stream_message(UserMessage(text=prompt)):
                if isinstance(ev, TextDelta):
                    full += ev.content
                    yield f"data: {json.dumps({'t': ev.content})}\n\n"
                elif isinstance(ev, StreamDone):
                    break
        except Exception as e:
            logger.error("chat error: %s", e)
            full = "Assistant is unavailable right now — please try again shortly."
            yield f"data: {json.dumps({'t': full})}\n\n"
        yield "data: [DONE]\n\n"
        await db.chat_messages.insert_one({"user_id": uid, "role": "assistant", "content": full, "at": now_iso()})

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.get("/chat/history")
async def chat_history(user=Depends(get_current_user)):
    return await db.chat_messages.find({"user_id": user["id"]},
                                       {"_id": 0, "role": 1, "content": 1, "at": 1}).sort("at", 1).to_list(50)


@router.delete("/chat/history")
async def clear_chat_history(user=Depends(get_current_user)):
    res = await db.chat_messages.delete_many({"user_id": user["id"]})
    return {"ok": True, "deleted": res.deleted_count}
