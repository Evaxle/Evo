<?php
// PHP admin credentials. Prefer setting via environment variables for security.
// Set PHP_ADMIN_USER and PHP_ADMIN_PASS in your environment. If PHP_ADMIN_PASS
// starts with '$' it will be treated as a password hash and verified with
// password_verify().

$envUser = getenv('PHP_ADMIN_USER');
$envPass = getenv('PHP_ADMIN_PASS');

if ($envUser !== false || $envPass !== false) {
    return [
        'user' => $envUser !== false ? $envUser : 'admin',
        'pass' => $envPass !== false ? $envPass : 'changeme',
    ];
}

// Fallback to file-based config (keep this file edited and out of source control)
return [
    // Username for Basic Auth (default requested)
    'user' => 'evaxle',
    // Password OR password hash. This is currently stored as plaintext per request.
    // For better security, replace this value with a hash from password_hash().
    'pass' => '295jg8a023v'
];
