const express = require('express');
const multer = require('multer');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');
const os = require('os');
const app = express();
const port = 2100;

// Store running scripts and their process IDs for stopping
let runningScripts = {};
let scriptLogs = {};  // Object to store logs for each script

// Set up multer to handle file uploads but do not store them
const upload = multer({ storage: multer.memoryStorage() });

// Serve static files (for simplicity, we will serve this within the same file)
app.use(express.static(path.join(__dirname, 'public')));

// Middleware to parse form data (for the node command input)
app.use(express.urlencoded({ extended: true }));

// Root route: Show the form for uploading the script and running Node.js commands
app.get('/', (req, res) => {
    res.send(`
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Script Manager</title>
            <link rel="stylesheet" href="/styles.css">
        </head>
        <body>
            <div class="container">
                <h1>Upload and Manage Scripts</h1>
                <form action="/upload" method="POST" enctype="multipart/form-data">
                    <label for="script">Choose a script (.js or .cjs):</label><br><br>
                    <input type="file" name="script" id="script" accept=".js,.cjs" required><br><br>
                    <button type="submit">Upload and Run Script</button>
                </form>
                <h2>Running Scripts</h2>
                <ul>
                    ${Object.keys(runningScripts).map(id => 
                        `<li>Script ID: ${id} <button onclick="window.location.href='/stop/${id}'">Stop</button></li>`
                    ).join('')}
                </ul>
                <h2><a href="/output">View Logs</a></h2>

                <!-- New button to navigate to Node.js commands -->
                <h2><a href="/node">Run Node.js Command</a></h2>
            </div>
        </body>
        </html>
    `);
});

// New route to render the Node.js command input form
app.get('/node', (req, res) => {
    res.send(`
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Run Node.js Command</title>
            <link rel="stylesheet" href="/styles.css">
        </head>
        <body>
            <div class="container">
                <h1>Run Node.js Command</h1>
                <form action="/node" method="POST">
                    <label for="command">Node.js Command:</label><br><br>
                    <textarea name="command" id="command" rows="4" cols="50" required></textarea><br><br>
                    <button type="submit">Run Command</button>
                </form>
                <p><a href="/">Go back</a></p>
            </div>
        </body>
        </html>
    `);
});

// Handle the form submission for running Node.js command
app.post('/node', (req, res) => {
    const command = req.body.command;

    if (!command) {
        return res.status(400).send('No command provided.');
    }

    try {
        // Run the provided Node.js command using exec
        exec(command, (error, stdout, stderr) => {
            let logOutput = '';
            if (error) {
                logOutput += `Error executing command: ${error.message}\n`;
            }
            if (stderr) {
                logOutput += `stderr: ${stderr}\n`;
            }
            if (stdout) {
                logOutput += `stdout: ${stdout}\n`;
            }

            // Display the output of the command
            res.send(`
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Node.js Command Output</title>
                    <link rel="stylesheet" href="/styles.css">
                </head>
                <body>
                    <div class="container">
                        <h1>Command Output</h1>
                        <pre>${logOutput}</pre>
                        <p><a href="/node">Run another command</a></p>
                        <p><a href="/">Go back</a></p>
                    </div>
                </body>
                </html>
            `);
        });
    } catch (error) {
        res.status(500).send(`Error executing command: ${error.message}`);
    }
});

// Handle the uploaded script directly from the memory buffer
app.post('/upload', upload.single('script'), (req, res) => {
    const uploadedFile = req.file;

    if (!uploadedFile) {
        return res.status(400).send('No file uploaded.');
    }

    // Validate the file extension to ensure it's .js or .cjs
    const fileExtension = path.extname(uploadedFile.originalname);
    if (fileExtension !== '.js' && fileExtension !== '.cjs') {
        return res.status(400).send('Only .js or .cjs files are allowed.');
    }

    // Create a temporary file to store the script content
    const scriptPath = path.join(os.tmpdir(), `script-${Date.now()}.js`);
    fs.writeFileSync(scriptPath, uploadedFile.buffer);

    const scriptId = Date.now(); // Unique ID for the script instance

    try {
        // Create a new child process to execute the script
        const childProcess = exec(`node ${scriptPath}`, (error, stdout, stderr) => {
            let logOutput = '';
            if (error) {
                logOutput += `Error executing script ${scriptId}: ${error.message}\n`;
            }
            if (stderr) {
                logOutput += `stderr from script ${scriptId}: ${stderr}\n`;
            }
            if (stdout) {
                logOutput += `stdout from script ${scriptId}: ${stdout}\n`;
            }

            // Save the log output for the script
            scriptLogs[scriptId] = logOutput;

            console.log(`Output from script ${scriptId}:`, logOutput);
            // Delete the temporary script file after execution
            fs.unlinkSync(scriptPath);
        });

        // Save the child process to manage it later
        runningScripts[scriptId] = childProcess;

        // Send success response with script ID
        res.send(`
            <html>
                <head><title>Script Running</title></head>
                <body>
                    <p>Script "${uploadedFile.originalname}" is now running.</p>
                    <p>Script ID: ${scriptId}</p>
                    <p><a href="/">Go back</a></p>
                </body>
            </html>
        `);
    } catch (error) {
        // Handle any errors during script execution
        res.status(500).send(`Error executing script: ${error.message}`);
    }
});

// Stop a running script
app.get('/stop/:id', (req, res) => {
    const scriptId = req.params.id;

    if (!runningScripts[scriptId]) {
        return res.status(404).send('Script not found.');
    }

    // Kill the child process to stop the script
    runningScripts[scriptId].kill();
    delete runningScripts[scriptId];  // Remove from runningScripts list

    res.send(`
        <html>
            <head><title>Script Stopped</title></head>
            <body>
                <p>Script with ID ${scriptId} has been stopped.</p>
                <p><a href="/">Go back</a></p>
            </body>
        </html>
    `);
});

// Output route to view the logs, optionally filtered by script ID
app.get('/output', (req, res) => {
    const scriptId = req.query.id;  // Get the script ID from the query parameter

    if (scriptId && scriptLogs[scriptId]) {
        // Show logs for the specific script ID
        res.send(`
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Script Logs</title>
                <link rel="stylesheet" href="/styles.css">
            </head>
            <body>
                <div class="container">
                    <h1>Script Logs</h1>
                    <h3>Script ID: ${scriptId}</h3>
                    <pre>${scriptLogs[scriptId]}</pre>
                    <p><a href="/">Go back</a></p>
                </div>
            </body>
            </html>
        `);
    } else {
        // Display logs for all scripts
        let logOutput = '';
        Object.keys(scriptLogs).forEach(id => {
            logOutput += `<h3>Script ID: ${id}</h3><pre>${scriptLogs[id]}</pre>`;
        });

        res.send(`
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Script Logs</title>
                <link rel="stylesheet" href="/styles.css">
            </head>
            <body>
                <div class="container">
                    <h1>All Script Logs</h1>
                    ${logOutput}
                    <p><a href="/">Go back</a></p>
                </div>
            </body>
            </html>
        `);
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
