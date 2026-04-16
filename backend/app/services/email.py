"""
app/services/email.py — HouseMind
Magic-link email dispatch via Resend (https://resend.com).

To swap to SendGrid: implement the same send_magic_link() interface.
The auth router calls this after creating the invite record.

Required env var: RESEND_API_KEY (add to .env.example and infra/env-vars-reference.toml)
If not set, email is skipped and the token is logged at WARNING level (dev only).
"""
from __future__ import annotations

import os

import httpx

from app.core.logging import get_logger

logger = get_logger(__name__)

RESEND_API_URL = "https://api.resend.com/emails"
FROM_ADDRESS = "HouseMind <noreply@housemind.app>"


async def send_magic_link(
    *,
    to_email: str,
    token: str,
    project_id: str,
    invitee_role: str,
    base_url: str,
) -> None:
    """
    Send a magic-link email to the invitee.
    base_url: e.g. "https://housemind.app" (no trailing slash)

    The link points to /auth/redeem?token=<token>&from=/workspace/<project_id>
    The frontend RedeemPage handles token → JWT exchange.
    """
    magic_url = f"{base_url}/auth/redeem?token={token}&from=/workspace/{project_id}"

    api_key = os.getenv("RESEND_API_KEY", "")
    if not api_key:
        # Dev fallback — log the link so devs can test without email
        logger.warning(
            "email.skipped_no_api_key",
            to=to_email,
            magic_url=magic_url,
        )
        return

    role_th = {
        "contractor": "ผู้รับเหมา",
        "homeowner": "เจ้าของบ้าน",
        "supplier": "ผู้จัดจำหน่าย",
    }.get(invitee_role, invitee_role)

    html_body = f"""
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
      <h2 style="font-size: 20px; color: #1a1a18; margin-bottom: 8px;">
        คุณได้รับเชิญเข้าร่วมโครงการ
      </h2>
      <p style="font-size: 14px; color: #888780; margin-bottom: 4px;">
        You've been invited as <strong>{role_th}</strong> ({invitee_role})
      </p>
      <p style="font-size: 13px; color: #888780; margin-bottom: 32px;">
        คลิกปุ่มด้านล่างเพื่อเข้าร่วม · Click below to join
      </p>
      <a href="{magic_url}"
         style="display:inline-block;background:#7F77DD;color:#fff;text-decoration:none;
                padding:14px 28px;border-radius:12px;font-size:15px;font-weight:600;">
        เข้าสู่พื้นที่ทำงาน · Open Workspace
      </a>
      <p style="font-size: 11px; color: #b4b2a9; margin-top: 32px;">
        ลิงก์นี้จะหมดอายุใน 72 ชั่วโมง · Link expires in 72 hours
      </p>
      <p style="font-size: 11px; color: #b4b2a9;">
        HouseMind · ระบบจัดการโครงการก่อสร้าง
      </p>
    </div>
    """

    text_body = (
        f"คุณได้รับเชิญเข้าร่วมโครงการ HouseMind ในฐานะ {role_th}\n\n"
        f"เปิดลิงก์นี้เพื่อเข้าร่วม:\n{magic_url}\n\n"
        f"ลิงก์หมดอายุใน 72 ชั่วโมง"
    )

    payload = {
        "from": FROM_ADDRESS,
        "to": [to_email],
        "subject": "คำเชิญเข้าร่วมโครงการ HouseMind · Project Invitation",
        "html": html_body,
        "text": text_body,
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            RESEND_API_URL,
            json=payload,
            headers={"Authorization": f"Bearer {api_key}"},
        )

    if resp.status_code not in (200, 201):
        logger.error(
            "email.send_failed",
            to=to_email,
            status=resp.status_code,
            body=resp.text[:200],
        )
        # Non-fatal: invite record is already created; user can re-request
    else:
        logger.info("email.sent", to=to_email, role=invitee_role)
