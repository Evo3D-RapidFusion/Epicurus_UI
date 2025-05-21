<?php
// Set content type to plain text
header('Content-Type: text/plain');

// Allow CORS
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Simple response
echo 'G-code executed';
?> 