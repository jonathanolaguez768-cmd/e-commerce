import type {
    EmailMessage,
    EmailSenderPort
} from "../port/email-sender";

export class ResendEmailAdapter implements EmailSenderPort {

    async sendEmail(message: EmailMessage): Promise<void> {

        const RESEND_API_KEY = process.env.RESEND_API_KEY

        if (!RESEND_API_KEY) {
            throw new Error("RESEND_API_KEY is not configured")
        }

        const response = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${RESEND_API_KEY}`,
            },
            body: JSON.stringify({
                from: "onboarding@resend.dev",
                to: [message.to],
                subject: message.subject,
                text: message.text,
            }),
        })

        const data = await response.json()

        if (!response.ok) {
            throw new Error(
                `Failed to send email with Resend: ${JSON.stringify(data)}`
            )
        }
    }
}
