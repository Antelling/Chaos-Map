export function initMobileConsole() {
  const outputEl = document.getElementById('console-output');
  const clearBtn = document.getElementById('console-clear');
  const copyBtn = document.getElementById('console-copy');

  if (!outputEl) return;

  const MAX_LINES = 100;
  const logs = [];

  function formatValue(arg) {
    if (arg === null) return 'null';
    if (arg === undefined) return 'undefined';
    if (arg instanceof Error) {
      return `${arg.name}: ${arg.message}\n${arg.stack}`;
    }
    if (typeof arg === 'object') {
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    }
    return String(arg);
  }

  function createLogLine(level, args) {
    const line = document.createElement('div');
    line.className = `console-line ${level}`;

    const timestamp = document.createElement('span');
    timestamp.className = 'timestamp';
    const now = new Date();
    timestamp.textContent = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

    const formatted = Array.from(args).map(formatValue).join(' ');
    const hasNewlines = formatted.includes('\n');

    if (hasNewlines) {
      const pre = document.createElement('pre');
      pre.style.margin = '0';
      pre.style.whiteSpace = 'pre-wrap';
      pre.style.wordBreak = 'break-word';
      pre.textContent = formatted;
      line.appendChild(timestamp);
      line.appendChild(pre);
    } else {
      const message = document.createElement('span');
      message.textContent = formatted;
      line.appendChild(timestamp);
      line.appendChild(message);
    }

    return line;
  }

  function addLog(level, args) {
    const emptyEl = outputEl.querySelector('.console-empty');
    if (emptyEl) emptyEl.remove();

    const line = createLogLine(level, args);
    outputEl.appendChild(line);
    logs.push({ level, args: Array.from(args) });

    while (outputEl.children.length > MAX_LINES) {
      outputEl.removeChild(outputEl.firstChild);
    }

    outputEl.scrollTop = outputEl.scrollHeight;
  }

  function showEmpty() {
    if (outputEl.children.length === 0) {
      outputEl.innerHTML = '<div class="console-empty">No console output yet...</div>';
    }
  }

  showEmpty();

  const originalLog = console.log;
  const originalInfo = console.info;
  const originalWarn = console.warn;
  const originalError = console.error;

  console.log = function(...args) {
    addLog('log', args);
    originalLog.apply(console, args);
  };

  console.info = function(...args) {
    addLog('info', args);
    originalInfo.apply(console, args);
  };

  console.warn = function(...args) {
    addLog('warn', args);
    originalWarn.apply(console, args);
  };

  console.error = function(...args) {
    addLog('error', args);
    originalError.apply(console, args);
  };

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      outputEl.innerHTML = '';
      logs.length = 0;
      showEmpty();
    });
  }

  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      const text = logs.map(log => {
        const time = new Date().toLocaleTimeString();
        return `[${time}] [${log.level.toUpperCase()}] ${log.args.map(formatValue).join(' ')}`;
      }).join('\n');

      const content = text || 'No logs to copy';

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(content).then(() => {
          const originalText = copyBtn.textContent;
          copyBtn.textContent = 'Copied!';
          setTimeout(() => {
            copyBtn.textContent = originalText;
          }, 1000);
        }).catch(() => {
          console.error('Failed to copy to clipboard');
        });
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = content;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        try {
          document.execCommand('copy');
          const originalText = copyBtn.textContent;
          copyBtn.textContent = 'Copied!';
          setTimeout(() => {
            copyBtn.textContent = originalText;
          }, 1000);
        } catch (err) {
          console.error('Failed to copy:', err);
        }
        document.body.removeChild(textarea);
      }
    });
  }

  window.addEventListener('error', (e) => {
    console.error(`Error: ${e.message} at ${e.filename}:${e.lineno}`);
  });

  window.addEventListener('unhandledrejection', (e) => {
    console.error('Unhandled Promise Rejection:', e.reason);
  });
}
