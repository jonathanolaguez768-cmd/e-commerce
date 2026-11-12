import type { EmailSenderPort } from "./port/email-sender"

import { NodemailerEmailAdapter } from "./adapters/nodemailer"
import { ResendEmailAdapter } from "./adapters/resend"

import { SendSupplierEmail } from "./use-cases/send_supplier_email"

function createEmailAdapter(): EmailSenderPort {

    const provider = process.env.EMAIL_PROVIDER

    switch (provider) {

        case "resend":
            return new ResendEmailAdapter()

        case "nodemailer":
            return new NodemailerEmailAdapter()

        default:
            throw new Error(
                `Unsupported EMAIL_PROVIDER: ${provider}`
            )
    }
}

const emailSender = createEmailAdapter()

export const sendSupplierEmail = new SendSupplierEmail(emailSender)
