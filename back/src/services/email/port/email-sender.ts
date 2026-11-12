export interface EmailMessage {
    to: string
    subject: string
    text: string
}

export interface EmailSenderPort {
    sendEmail(message: EmailMessage): Promise<void>
}
