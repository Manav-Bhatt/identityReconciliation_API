"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const app = (0, express_1.default)();
app.use(express_1.default.json());
app.get('/', (req, res) => {
    res.status(200).send('Bitespeed Identity Reconciliation API is running perfectly!');
});
app.post('/identify', async (req, res) => {
    try {
        const { email, phoneNumber } = req.body;
        // Reject if both fields are missing
        if (!email && !phoneNumber) {
            return res.status(400).json({ error: 'Either email or phoneNumber is required' });
        }
        const phoneStr = phoneNumber ? String(phoneNumber) : null;
        const orConditions = [];
        if (email)
            orConditions.push({ email });
        if (phoneStr)
            orConditions.push({ phoneNumber: phoneStr });
        const matchedContacts = await prisma.contact.findMany({
            where: { OR: orConditions }
        });
        //SCENARIO 1: Brand New Customer (No matches found)
        if (matchedContacts.length === 0) {
            const newContact = await prisma.contact.create({
                data: {
                    email: email || null,
                    phoneNumber: phoneStr || null,
                    linkPrecedence: 'primary',
                }
            });
            return res.status(200).json({
                contact: {
                    primaryContatctId: newContact.id,
                    emails: newContact.email ? [newContact.email] : [],
                    phoneNumbers: newContact.phoneNumber ? [newContact.phoneNumber] : [],
                    secondaryContactIds: []
                }
            });
        }
        const matchedIds = matchedContacts.map((c) => c.id);
        const linkedIds = matchedContacts.map((c) => c.linkedId).filter((id) => id !== null);
        const allRelevantIds = Array.from(new Set([...matchedIds, ...linkedIds]));
        let allContacts = await prisma.contact.findMany({
            where: {
                OR: [
                    { id: { in: allRelevantIds } },
                    { linkedId: { in: allRelevantIds } }
                ]
            }
        });
        // 4. Find the oldest Primary Contact among the network
        const primaryContacts = allContacts
            .filter((c) => c.linkPrecedence === 'primary' || c.linkedId === null)
            .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        // Failsafe in case all matched contacts were secondaries
        const ultimatePrimary = primaryContacts.length > 0 ? primaryContacts[0] : allContacts[0];
        const secondaryPrimaries = primaryContacts.slice(1);
        // SCENARIO 4: Account Merge (We found multiple primary contacts)
        if (secondaryPrimaries.length > 0) {
            for (const sp of secondaryPrimaries) {
                await prisma.contact.update({
                    where: { id: sp.id },
                    data: {
                        linkPrecedence: 'secondary',
                        linkedId: ultimatePrimary.id
                    }
                });
                await prisma.contact.updateMany({
                    where: { linkedId: sp.id },
                    data: {
                        linkedId: ultimatePrimary.id
                    }
                });
            }
            allContacts = await prisma.contact.findMany({
                where: {
                    OR: [
                        { id: ultimatePrimary.id },
                        { linkedId: ultimatePrimary.id }
                    ]
                }
            });
        }
        // SCENARIO 2/3: Do we need to add a new secondary?
        const existingEmails = new Set(allContacts.map((c) => c.email).filter((e) => e !== null));
        const existingPhones = new Set(allContacts.map((c) => c.phoneNumber).filter((p) => p !== null));
        const isNewEmail = email && !existingEmails.has(email);
        const isNewPhone = phoneStr && !existingPhones.has(phoneStr);
        if (isNewEmail || isNewPhone) {
            const newSecondary = await prisma.contact.create({
                data: {
                    email: email || null,
                    phoneNumber: phoneStr || null,
                    linkedId: ultimatePrimary.id,
                    linkPrecedence: 'secondary'
                }
            });
            allContacts.push(newSecondary);
        }
        //Format the response
        const emails = new Set();
        const phoneNumbers = new Set();
        const secondaryContactIds = new Set();
        if (ultimatePrimary.email)
            emails.add(ultimatePrimary.email);
        if (ultimatePrimary.phoneNumber)
            phoneNumbers.add(ultimatePrimary.phoneNumber);
        for (const c of allContacts) {
            if (c.email)
                emails.add(c.email);
            if (c.phoneNumber)
                phoneNumbers.add(c.phoneNumber);
            if (c.id !== ultimatePrimary.id) {
                secondaryContactIds.add(c.id);
            }
        }
        return res.status(200).json({
            contact: {
                primaryContatctId: ultimatePrimary.id,
                emails: Array.from(emails),
                phoneNumbers: Array.from(phoneNumbers),
                secondaryContactIds: Array.from(secondaryContactIds)
            }
        });
    }
    catch (error) {
        console.error('Error processing request:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Identity Reconciliation Server is running on port ${PORT}`);
});
