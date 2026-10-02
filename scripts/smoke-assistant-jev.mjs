#!/usr/bin/env node

import {
    evaluateSystemOne,
    SYSTEM_ONE_ENDPOINT,
} from '../src/lib/bot/assistant-jev.ts';

if (!process.env.SYSTEMONE_API_KEY && !process.env.TYPESAFE_API_KEY) {
    console.error('SYSTEMONE_API_KEY is required.');
    process.exit(1);
}

process.env.ASSISTANT_JEV_ENABLED = 'true';
process.env.SYSTEMONE_ENDPOINT = SYSTEM_ONE_ENDPOINT;

const result = await evaluateSystemOne({
    state: {
        question: 'Apakah ada purchase order berstatus draft?',
        deterministicHint: 'data',
        availableTools: ['get_purchase_order', 'search_help_articles'],
    },
    questions: {
        intent: {
            type: 'choice',
            instructions:
                'Pilih intent. Pertanyaan keberadaan/status transaksi adalah data.',
            criteria: {
                guidance: 'Meminta panduan cara memakai UI.',
                data: 'Meminta pemeriksaan data aktual.',
                diagnosis: 'Meminta penyebab masalah.',
                execution: 'Meminta asisten mengubah transaksi.',
                conversation: 'Percakapan umum.',
            },
        },
        route: {
            type: 'choice',
            instructions:
                'Pilih rute utama. Pemeriksaan status transaksi harus memakai data_tools, bukan artikel.',
            criteria: {
                data_tools: 'Gunakan tool data tenant.',
                knowledge_base: 'Gunakan artikel panduan.',
                clarify: 'Perlu detail tambahan.',
                conversation: 'Tidak perlu tool.',
            },
        },
    },
});

if (result.status !== 'completed') {
    console.error(`JEV smoke unavailable: ${result.code}`);
    process.exit(1);
}

const intent = result.data.answers.intent;
const route = result.data.answers.route;
if (
    intent?.type !== 'choice' ||
    intent.choice !== 'data' ||
    route?.type !== 'choice' ||
    route.choice !== 'data_tools'
) {
    console.error(
        `Unexpected JEV smoke result: model=${result.model} intent=${intent?.type === 'choice' ? intent.choice : 'missing'} route=${route?.type === 'choice' ? route.choice : 'missing'}`,
    );
    process.exit(1);
}

console.log(
    `JEV smoke passed: model=${result.model} intent=${intent.choice} route=${route.choice}`,
);
