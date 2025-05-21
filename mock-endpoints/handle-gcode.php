<?php
// Set content type to plain text
header('Content-Type: text/plain');

// Allow CORS
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Handle preflight OPTIONS request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Handle POST request
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // Get the raw POST data
    $gcode = file_get_contents('php://input');
    
    // Log the G-code to a file if needed
    file_put_contents('gcode_log.txt', date('[Y-m-d H:i:s] ') . $gcode . PHP_EOL, FILE_APPEND);
    
    // Respond with success message
    echo 'G-code executed';
} else {
    // Method not allowed
    http_response_code(405);
    echo 'Method Not Allowed';
}
?> 