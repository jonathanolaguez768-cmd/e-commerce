import nodemailer from "nodemailer";

import type {
    EmailMessage,
    EmailSenderPort
} from "../port/email-sender";

export class NodemailerEmailAdapter implements EmailSenderPort {

    private transporter

    constructor() {

        const GMAIL_USER = process.env.GMAIL_USER
        const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD

        if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
            throw new Error("Gmail credentials are not configured")
        }

        this.transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: GMAIL_USER,
                pass: GMAIL_APP_PASSWORD
            }
        })
    }

    async sendEmail(message: EmailMessage): Promise<void> {

        await this.transporter.sendMail({
            from: `"Purchase Orders" <${process.env.GMAIL_USER}>`,
            to: message.to,
            subject: message.subject,
            text: message.text
        })
    }
}
