import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const app = express();
app.use(express.json());
// Health check route 
app.get('/', (req: Request, res: Response) => {
    res.status(200).send('Identity Reconciliation API is running perfectly!, hit /identify endpoint with payload');
  });

app.post('/identify', async (req: Request, res: Response): Promise<any> => {
  try {
    const { email, phoneNumber } = req.body;

    // Reject if both fields are missing
    if (!email && !phoneNumber) {
      return res.status(400).json({ error: 'Either email or phoneNumber is required' });
    }

    // Convert phoneNumber to string to standardize database searches
    const phoneStr = phoneNumber ? String(phoneNumber) : null;

    // Construct search conditions dynamically
    const orConditions = [];
    if (email) orConditions.push({ email });
    if (phoneStr) orConditions.push({ phoneNumber: phoneStr });

    // 1. Find ANY contacts that match the incoming email or phone
    const matchedContacts = await prisma.contact.findMany({
      where: { OR: orConditions }
    });

    // 2. SCENARIO 1: Brand New Customer (No matches found)
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

    // 3. Gather all related contacts (the entire "tree" of the matches)
    const matchedIds = matchedContacts.map(c => c.id);
    
    // TYPE FIX 1: Explicitly tell TypeScript we are removing nulls and returning strict numbers
    const linkedIds = matchedContacts.map(c => c.linkedId).filter((id): id is number => id !== null);
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
      .filter(c => c.linkPrecedence === 'primary' || c.linkedId === null)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    // Failsafe in case all matched contacts were secondaries
    const ultimatePrimary = primaryContacts.length > 0 ? primaryContacts[0] : allContacts[0];
    const secondaryPrimaries = primaryContacts.slice(1);

    // 5. SCENARIO 4: Account Merge (We found multiple primary contacts)
    if (secondaryPrimaries.length > 0) {
      for (const sp of secondaryPrimaries) {
        // Demote newer primaries to secondaries
        await prisma.contact.update({
          where: { id: sp.id },
          data: {
            linkPrecedence: 'secondary',
            linkedId: ultimatePrimary.id
          }
        });

        // Redirect all of their existing secondaries to the ultimate primary
        await prisma.contact.updateMany({
          where: { linkedId: sp.id },
          data: {
            linkedId: ultimatePrimary.id
          }
        });
      }

      // Refresh our local network list after updating the database
      allContacts = await prisma.contact.findMany({
        where: {
          OR: [
            { id: ultimatePrimary.id },
            { linkedId: ultimatePrimary.id }
          ]
        }
      });
    }

    // 6. SCENARIO 2/3: Do we need to add a new secondary?
    // TYPE FIX 2: Ensure the Sets are strictly typed as strings
    const existingEmails = new Set(allContacts.map(c => c.email).filter((e): e is string => e !== null));
    const existingPhones = new Set(allContacts.map(c => c.phoneNumber).filter((p): p is string => p !== null));

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

    // 7. Format the response
    const emails = new Set<string>();
    const phoneNumbers = new Set<string>();
    
    // TYPE FIX 3: Initialize as a Set, not an array, so we can use .add()
    const secondaryContactIds = new Set<number>(); 

    if (ultimatePrimary.email) emails.add(ultimatePrimary.email);
    if (ultimatePrimary.phoneNumber) phoneNumbers.add(ultimatePrimary.phoneNumber);

    for (const c of allContacts) {
      if (c.email) emails.add(c.email);
      if (c.phoneNumber) phoneNumbers.add(c.phoneNumber);
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

  } catch (error) {
    console.error('Error processing request:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Identity Reconciliation Server is running on port ${PORT}`);
});