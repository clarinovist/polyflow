import base from '../../vitest.config.ts';

if (!['1/2', '2/2'].includes(process.env.CI_BENCHMARK_SHARD)) {
    throw new Error('Collection-only config requires a two-shard benchmark; never use as a coverage gate');
}

export default {
    ...base,
    test: {
        ...base.test,
        coverage: {
            ...base.test.coverage,
            // Partial coverage cannot be compared to a global threshold. The mandatory
            // merge job uses the ORIGINAL config/thresholds on the combined blob maps.
            thresholds: undefined,
        },
    },
};
