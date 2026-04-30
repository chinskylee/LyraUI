// Lightweight markdown renderer (no external dependencies)
function renderMarkdown(md) {
  let html = md;
  // Escape HTML special chars except $ for KaTeX
  html = html.replace(/&(?![a-zA-Z]+;)/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  // Code blocks (```...```) - process first to avoid inner content being parsed
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, function(_, lang, code) {
    return '<pre><code class="language-' + (lang || '') + '">' + code.trim() + '</code></pre>';
  });
  // Headers
  html = html.replace(/^#### (.*)$/gm, '<h4>$1</h4>');
  html = html.replace(/^### (.*)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.*)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.*)$/gm, '<h1>$1</h1>');
  // Blockquotes
  html = html.replace(/^> (.*)$/gm, '<blockquote>$1</blockquote>');
  // Horizontal rule
  html = html.replace(/^---$/gm, '<hr>');
  // Unordered lists - group consecutive list items
  html = html.replace(/(?:^- .*\n?)+/gm, function(match) {
    const items = match.replace(/^- (.*)$/gm, '<li>$1</li>');
    return '<ul>' + items + '</ul>';
  });
  // Ordered lists - group consecutive list items
  html = html.replace(/(?:^\d+\. .*\n?)+/gm, function(match) {
    const items = match.replace(/^\d+\. (.*)$/gm, '<li>$1</li>');
    return '<ol>' + items + '</ol>';
  });
  // Bold and italic (process bold+italic first to avoid conflicts)
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
  // Images
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');
  // Paragraphs - wrap consecutive non-block elements with <p>
  const blocks = html.split(/\n\n+/);
  html = blocks.map(function(block) {
    if (/^<(h[1-6]|pre|ul|ol|blockquote|hr)/.test(block.trim())) {
      return block;
    }
    return block.trim() ? '<p>' + block + '</p>' : '';
  }).filter(Boolean).join('');
  return html;
}

// Render KaTeX formulas in element
function renderFormulas(element) {
  if (typeof renderMathInElement === 'function') {
    try {
      renderMathInElement(element, {
        delimiters: [
          {left: '$$', right: '$$', display: true},
          {left: '$', right: '$', display: false}
        ],
        throwOnError: false
      });
    } catch(e) {}
  }
}
