import { promisify } from "util"
import * as fs from "fs"
import * as estree from "estree"
import * as esprima from "esprima"


export interface SaveLicenseOptions {
    readonly patterns: ReadonlyArray<RegExp>
    readonly encoding: string
}
export const defaultOptions: SaveLicenseOptions = Object.freeze({
    patterns: Object.freeze([
        /^!|^@(preserve|cc_on)\b|\b(MIT|MPL|GPL|License|Copyright)\b|\W\(c\)|©/mi
    ]),
    encoding: "utf8",
})

const readFile = promisify(fs.readFile)
const writeFile = promisify(fs.writeFile)

// type lines = NoLines | Lines of Comment list * number
// let reduceBlock (acc, s) e =
//     match s, e with
//     | NoLines, (Line { startLine } as c) -> acc, Lines([c], startLine)
//     | NoLines, (Block _ as c) -> [c]::acc, NoLines
//     | Lines(ls, line), (Line { startLine } as c) when line + 1 = startLine -> acc, Lines(c::ls, startLine)
//     | Lines(ls, _), (Line { startLine } as c) -> ls::acc, Lines([c], startLine)
//     | Lines(ls, line), (Block _ as c) -> [c]::ls::acc, NoLines

interface LinesState {
    line: number
    lines: estree.Comment[]
}
interface ReduceState {
    readonly blocks: estree.Comment[][]
    last: LinesState | null
}
function reduceBlock(s: ReduceState, c: estree.Comment) {
    const line = c.loc!.start.line

    if (s.last === null) {
        if (c.type === "Line") {
            s.last = { line, lines: [c] }
        }
        else {
            s.blocks.push([c])
            s.last = null
        }
    }
    else {
        if (c.type === "Line") {
            if (s.last.line + 1 === line) {
                s.last.line = line
                s.last.lines.push(c)
            }
            else {
                s.blocks.push(s.last.lines)
                s.last = { line, lines: [c] }
            }
        }
        else {
            s.blocks.push(s.last.lines)
            s.blocks.push([c])
            s.last = null
        }
    }
    return s
}

export const getCommentBlocks = (comments: ReadonlyArray<estree.Comment>) => {
    const { blocks, last } = comments.reduce(reduceBlock, { blocks: [], last: null })
    if (last !== null) { blocks.push(last.lines) }
    return blocks
}

export function getLicences(code: string, patterns: ReadonlyArray<RegExp>) {
    code = code.replace(/[\r\n]+/g, "\n")

    const program = esprima.parseScript(code, {
        comment: true,
        loc: true,
    })

    const comments = program.comments
    if (comments === void 0) { return [] }

    return getCommentBlocks(comments)
        .filter(b => b.some(c => patterns.some(p => p.test(c.value))))
}

const escape = (s: string) => s.replace(/[\u0008\t\n\v\f\r"'`\\]/, s => {
    switch (s) {
        case "\b": return "\\b"
        case "\t": return "\\t"
        case "\n": return "\\n"
        case "\v": return "\\v"
        case "\f": return "\\f"
        case "\r": return "\\r"
        case "\"": return "\\\""
        case "\'": return "\\\'"
        case "\`": return "\\\`"
        case "\\": return "\\\\"
        default: return s
    }
})

function log(format: TemplateStringsArray, ...objs: unknown[]) {
    console.log(String.raw(format, ...objs))
}

export const saveLicense = async (files: string[] | string, outFile: string, { patterns = [], encoding = "" }: Partial<SaveLicenseOptions> = defaultOptions) => {
    if (typeof files === "string") { files = [files] }

    const ms1 = Date.now()
    log`# Start save-license`
    log`  - Patterns: ${patterns.join(", ")}`
    log`  - Encoding: "${escape(encoding)}"`
    log``

    log`# Read licenses`
    const licenseSet = new Set<string>()

    for (const file of files) {
        const licenses = await getLicences(await readFile(file, encoding), patterns)
        for (const block of licenses) {
            const text = block.map(c => c.value).join("\n")
            const hasText = licenseSet.has(text)
            if (hasText === false) {
                licenseSet.add(text)
            }

            const start = block[0].loc!.start
            const head = text.substr(0, 10)
            const ellipsis = head.length === text.length ? "" : "..."
            const operation = hasText ? "merge" : "add"
            log`  - ${file}(${start.line}, ${1 + start.column}) ${escape(head)}${ellipsis} [${operation}]`
        }
    }
    log``

    await writeFile(outFile, Array.from(licenseSet).join("\n\n"), { encoding })
    log`# Finish`
    log`  - Out: ${outFile}`
    log`  - Count: ${licenseSet.size}`
    log`  - Time: ${(Date.now() - ms1) / 1000}s`
}
