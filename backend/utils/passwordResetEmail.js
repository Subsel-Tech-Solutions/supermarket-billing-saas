const escapeHtml = (value) => String(value || "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char]));

const sendPasswordResetEmail = async ({ to, name, resetUrl }) => {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  const appUrl = process.env.FRONTEND_URL;
  if (!apiKey || !from || !appUrl) throw new Error("Password reset email is not configured");

  const safeName = escapeHtml(name || "there");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [to],
      subject: "Reset your SuperMart POS password",
      html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#25251f"><h2>Password reset</h2><p>Hello ${safeName},</p><p>We received a request to reset your SuperMart POS password. This link expires in 30 minutes and can only be used once.</p><p><a href="${escapeHtml(resetUrl)}" style="display:inline-block;padding:12px 18px;background:#25251f;color:white;text-decoration:none;border-radius:8px">Choose a new password</a></p><p>If you did not request this, you can ignore this email.</p></div>`,
      text: `Hello ${name || "there"},\n\nReset your SuperMart POS password using this link (expires in 30 minutes):\n${resetUrl}\n\nIf you did not request this, ignore this email.`,
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Password reset email provider returned ${response.status}`);
};

module.exports = { sendPasswordResetEmail };
