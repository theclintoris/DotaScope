const fs = require('fs')
const path = require('path')
const files = []
function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name)
    if (fs.statSync(p).isDirectory()) walk(p)
    else if (p.endsWith('.tsx')) files.push(p)
  }
}
walk('src')
const classes = new Map()
for (const file of files) {
  const source = fs.readFileSync(file, 'utf8')
  const regex = /className=(?:"([^"]*)"|'([^']*)'|`([^`]*)`|\{([^}]*)\})/gs
  for (const match of source.matchAll(regex)) {
    const text = match[1] || match[2] || match[3] || match[4] || ''
    for (const token of text.match(/[a-z][a-z0-9-]{2,}/gi) || []) {
      if (['classNames', 'isActive', 'open', 'index', 'false', 'true', 'value', 'type', 'size'].includes(token)) continue
      classes.set(token, (classes.get(token) || 0) + 1)
    }
  }
}
console.log([...classes.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([name, count]) => `${name}:${count}`).join('\n'))
