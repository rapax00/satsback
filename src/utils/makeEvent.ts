import {
    EventTemplate,
    finalizeEvent,
    getPublicKey,
    nip04,
    NostrEvent,
} from 'nostr-tools';
import * as dotenv from 'dotenv';
import { prisma } from './prismaClient';
import { Volunteer } from '@prisma/client';

dotenv.config();

const whitelistPublicKeys = {
    pulpo: '9c38f29d508ffdcbe6571a7cf56c963a5805b5d5f41180b19273f840281b3d45',
    agustin: 'a1b0f9fdc84a81e1fa3b0289de83486792d68407f9e13baf22850f1f1f9b61b2',
    juan: '3699cf3fab1aa22dad84155639d35911013c63bbe6e26818e2584ed12cebeb6e',
    rapax: '994d52a31d3efd0ac661b1940e3f3dcae49c750d6dd90c68600589f272e3bc85',
    dios: 'cee287bb0990a8ecbd1dee7ee7f938200908a5c8aa804b3bdeaed88effb55547',
    el7: 'ff64654a88bee78dba2d1d9999b4224fb72d4821e32e722ae3871f438431021b',
};

const whitelistVolunteers = {
    pulpochorizo:
        '308e83914a7d1b52b5497906f821b83ee0d4a417a50572d36a6c30169a3e968a',
};

async function makeEvent(
    eTag: string,
    amount: number,
    userPubkey: string,
    ledgerPubkey: string,
    privateKey: Uint8Array
): Promise<NostrEvent> {
    try {
        // Check if user is allowed to make satsback // debug
        if (
            !Object.values(whitelistPublicKeys).includes(userPubkey) &&
            !Object.values(whitelistVolunteers).includes(userPubkey)
        ) {
            throw new Error('User not allowed to make satsback');
        }

        // Calculate satsback amount
        let satsbackAmount: number;
        let satsbackMemo: string = 'Satsback por pagar con LaCard.';

        /// VOLUNTEER ///
        const volunteer: Volunteer | null = await prisma.volunteer.findUnique({
            where: {
                publicKey: userPubkey,
            },
        });

        if (volunteer && volunteer.voucherMilisats > 0) {
            // Check if are sats in the voucher
            const satsbackRate: number = parseFloat(
                process.env.SATSBACK_VOLUNTEERS!
            );

            // Calculate amount in mSats
            const safeMinimumAmount = Math.max(1000, amount * satsbackRate); // prevent less than 1 sat

            const roundAmount = Math.floor(safeMinimumAmount / 1000) * 1000; // prevent milisats

            satsbackAmount = Math.min(roundAmount, volunteer.voucherMilisats); // prevent more than voucher

            const newVoucherMilisats =
                volunteer.voucherMilisats - satsbackAmount;

            // Memo
            if (
                satsbackAmount === volunteer.voucherMilisats // means that the satsbackAmount is the same as the voucher, make it empty
            ) {
                satsbackMemo = `Terminaste tu voucher. Gracias por ser voluntario! <3`;
            } else {
                satsbackMemo =
                    'Satsback por pagar con LaCard y ser voluntario.' +
                    ` (${satsbackRate * 100}% OFF). Te quedan ${newVoucherMilisats / 1000} sats en tu voucher.`;
            }

            // Update voucher
            await prisma.volunteer.update({
                where: {
                    publicKey: userPubkey,
                },
                data: {
                    voucherMilisats: newVoucherMilisats,
                },
            });
        }
        /// DEFAULT ///
        else {
            const satsbackRate: number = parseFloat(
                process.env.SATSBACK_DEFAULT!
            );

            satsbackMemo += ` (${satsbackRate * 100}% OFF)`;

            // Calculate amount in mSats
            const safeMinimumAmount = Math.max(1000, amount * satsbackRate); // prevent less than 1 sat

            const roundAmount = Math.floor(safeMinimumAmount / 1000) * 1000; // prevent milisats

            satsbackAmount = roundAmount;
        }

        // Metadata tag
        // Sender
        const senderPubkeyInfo = await fetch(
            'https://lawallet.ar/api/pubkey/' + getPublicKey(privateKey)
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const senderJson: any = await senderPubkeyInfo.json();
        const senderWalias =
            senderJson.username + '@' + senderJson.federationId;

        // Receiver
        const receiverPubkeyInfo = await fetch(
            'https://lawallet.ar/api/pubkey/' + userPubkey
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const receiverJson: any = await receiverPubkeyInfo.json();
        const receiverWalias =
            receiverJson.username + '@' + receiverJson.federationId;

        const metadataContent: { sender: string; receiver: string } = {
            sender: senderWalias,
            receiver: receiverWalias,
        };

        const metadataContentEncrypt = await nip04.encrypt(
            privateKey,
            userPubkey,
            JSON.stringify(metadataContent)
        );

        // Make event
        const content = {
            tokens: {
                BTC: satsbackAmount,
            },
            memo: satsbackMemo,
        };

        const unsignedEvent: EventTemplate = {
            kind: 1112,
            tags: [
                ['p', ledgerPubkey],
                ['p', userPubkey],
                ['t', 'internal-transaction-start'],
                ['t', 'satsback'],
                ['e', eTag],
                ['metadata', 'true', 'nip04', metadataContentEncrypt],
            ],
            content: JSON.stringify(content),
            created_at: Math.round(Date.now() / 1000) + 1,
        };

        const signedEvent: NostrEvent = finalizeEvent(
            unsignedEvent,
            privateKey
        );

        return signedEvent;

        // eslint-disable-next-line
    } catch (error: any) {
        console.error('Error in makeEvent:', error);
        throw error;
    }
}

export { makeEvent };
