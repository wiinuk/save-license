import "mocha"
import { assert } from "chai"
import { getCommentBlocks, getLicences } from "../src/save-license"
import * as esprima from "esprima"

describe("save-license", () => {
    it("getCommentBlocks", () => {

        const program = esprima.parseScript(`
            //1
            //2
            
            //10
            //11
            
            //20
            /*30*/
            /*40*/
            //50
            //51
            
            //60

            `, { loc: true, comment: true }
        )

        const comments = program.comments
        if (comments === void 0) { throw new Error("comments not found.") }

        const bs = getCommentBlocks(comments)

        const actual = bs.map(cs => cs.map(c => c.value))
        const expected = [
            ["1", "2"],
            ["10", "11"],
            ["20"],
            ["30"],
            ["40"],
            ["50", "51"],
            ["60"],
        ]
        assert.deepEqual(actual, expected, JSON.stringify(bs))
    })

    it("getLicenses", () => {
        const comments = getLicences(`
/*!
 * @license  MIT
 */

/* Copyright (c) _
 */

/**
 * released under the MIT license _
 */

// Copyright _
// THE SOFTWARE IS _

var a = 0;

// (C) _
//
// This software is _
`
        )
        const actual = comments.map(cs => cs.map(c => c.value).join("\n"))
        const expected = [
            "!\n * @license  MIT\n ",
            " Copyright (c) _\n ",
            "*\n * released under the MIT license _\n ",
            " Copyright _\n THE SOFTWARE IS _",
            " (C) _\n\n This software is _",
        ]
        assert.deepEqual(actual, expected, JSON.stringify(comments))
    })
})
