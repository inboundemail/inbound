'use strict';

const crypto = require('crypto');

// Expose to the world
module.exports = getTLSOptions;

// Mozilla "intermediate" TLS 1.2 cipher list (AEAD + forward secrecy only); TLS 1.3 suites use Node's defaults
const MOZILLA_INTERMEDIATE_CIPHERS = [
    'ECDHE-ECDSA-AES128-GCM-SHA256',
    'ECDHE-RSA-AES128-GCM-SHA256',
    'ECDHE-ECDSA-AES256-GCM-SHA384',
    'ECDHE-RSA-AES256-GCM-SHA384',
    'ECDHE-ECDSA-CHACHA20-POLY1305',
    'ECDHE-RSA-CHACHA20-POLY1305',
    'DHE-RSA-AES128-GCM-SHA256',
    'DHE-RSA-AES256-GCM-SHA384',
    'DHE-RSA-CHACHA20-POLY1305'
].join(':');

const tlsDefaults = {
    ciphers: MOZILLA_INTERMEDIATE_CIPHERS,
    honorCipherOrder: true,
    requestOCSP: false,
    sessionIdContext: crypto.createHash('sha1').update(process.argv.join(' ')).digest('hex').slice(0, 32),
    minVersion: 'TLSv1.2'
};

/**
 * Mixes existing values with the default ones.
 *
 * @param {Object} [opts] TLS options
 * @returns {Object} Object with mixed TLS values
 */
function getTLSOptions(opts) {
    return Object.assign({}, tlsDefaults, opts || {});
}
