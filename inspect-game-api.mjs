import fs from 'fs'
import path from 'path'
import os from 'os'

const scriptPath = path.join(process.env.APPDATA || os.homedir(), 'Nememu', 'game', 'build', 'script.js')
const src = fs.readFileSync(scriptPath, 'utf-8')

console.log('########## tous les tabId litteraux ##########')
const tabs = new Set()
const re = /tabId:\s*"([a-zA-Z0-9_]+)"/g
let m
while ((m = re.exec(src)) !== null) tabs.add(m[1])
console.log([...tabs].sort().join('  '))

console.log('\n########## onglets declares par le grimoire ##########')
const gi = src.indexOf('addWindow("grimoire"')
console.log(gi === -1 ? 'introuvable' : src.slice(Math.max(0, gi - 900), gi + 200).replace(/\s+/g, ' '))
