function log(...args) {
    // Create a new Error object to capture the stack trace
    const err = new Error();

    // Remove the Error: message and the first line of the stack (which is this function)
    Error.captureStackTrace(err, log);

    // Extract the caller information from the stack trace
    const stackLines = err.stack.split('\n');
    let fileInfo = '';

    if (stackLines.length > 1) {
        // The second line of the stack contains the caller information
        const callerLine = stackLines[1].trim();

        // Extract just the filename and line number using regex
        // This will match patterns like: at func (http://server/path/filename.js:123:45)
        // And extract just the filename.js:123 part
        const match = callerLine.match(/\((?:https?:\/\/[^\/]+\/)?([^:]+):(\d+):\d+\)/);

        if (match) {
            const [, fileName, lineNum] = match;
            fileInfo = `[${fileName}:${lineNum}]`;
        }
    }

    // Log the arguments along with the file information in a single message
    if (fileInfo) {
        // Create a copy of the args array and add the file info
        const newArgs = [...args];
        newArgs.push(fileInfo);
        console.log(...newArgs);
    } else {
        // Fallback to regular logging if we couldn't get file info
        console.log(...args);
    }
}
