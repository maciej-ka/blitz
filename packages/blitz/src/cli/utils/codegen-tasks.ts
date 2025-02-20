import {generateManifest} from "./routes-manifest"
import {log} from "../../logging"
import resolveCwd from "resolve-cwd"
import {join} from "path"
import fs from "fs-extra"
import {getPackageJson} from "./get-package-json"
import {runPrisma} from "../../utils/run-prisma"
import semver from "semver"

import resolveFrom from "resolve-from"
export const codegenTasks = async () => {
  try {
    /*
      Updates the user's nextjs file and adds onRecoverableError to the hydrateRoot 3rd parameter object.
      We can remove this when https://github.com/vercel/next.js/pull/38207 is merged into next.js
    */
    const nextDir = await resolveCwd("next")
    const nextClientIndex = join(nextDir, "../..", "client", "index.js")
    console.log(nextClientIndex)
    const readFile = await fs.readFile(nextClientIndex)
    const packageJson = await getPackageJson()
    const version = packageJson.dependencies.next
    const nextVersion = semver.clean(version, {loose: true}) || semver.valid(semver.coerce(version))

    if (nextVersion && /^([~^])?12/.test(nextVersion)) {
      const updatedFile = readFile
        .toString()
        .replace(
          /ReactDOM\.hydrateRoot\(.*?\);/,
          `ReactDOM.hydrateRoot(domEl, reactEl, {onRecoverableError: (err) => (err.toString().includes("DYNAMIC_SERVER_USAGE") || err.toString().includes("could not finish this Suspense boundary") || err.toString().includes("Minified React error #419")) ? null : console.error(err)});`,
        )
      await fs.writeFile(nextClientIndex, updatedFile)
      log.success("Next.js was successfully patched with a React Suspense fix")
    } else if (nextVersion && semver.satisfies(nextVersion, "13 - 13.0.6")) {
      const updatedFile = readFile
        .toString()
        .replace(
          /_client.default\.hydrateRoot\(.*?\);/,
          `_client.default.hydrateRoot(domEl, reactEl, {onRecoverableError: (err) => (err.toString().includes("DYNAMIC_SERVER_USAGE") || err.toString().includes("could not finish this Suspense boundary") || err.toString().includes("Minified React error #419")) ? null : console.error(err)});`,
        )
      await fs.writeFile(nextClientIndex, updatedFile)
      log.success("Next.js was successfully patched with a React Suspense fix")
    } else if (nextVersion && semver.satisfies(nextVersion, "13.1 - 13.3.0")) {
      const updatedFile = readFile
        .toString()
        .replace(
          /_onRecoverableError\.default$/gm,
          `(err) => (err.toString().includes("DYNAMIC_SERVER_USAGE") || err.toString().includes("could not finish this Suspense boundary") || err.toString().includes("Minified React error #419")) ? null : _onRecoverableError.default(err)`,
        )
      await fs.writeFile(nextClientIndex, updatedFile)
      log.success("Next.js was successfully patched with a React Suspense fix")
    } else if (nextVersion && semver.satisfies(nextVersion, ">=13.3.1")) {
      const updatedFile = readFile
        .toString()
        .replace(
          /_onrecoverableerror\.default$/gm,
          `(err) => (err.toString().includes("DYNAMIC_SERVER_USAGE") || err.toString().includes("could not finish this Suspense boundary") || err.toString().includes("Minified React error #419")) ? null : _onrecoverableerror.default(err)`,
        )
      await fs.writeFile(nextClientIndex, updatedFile)
      log.success("Next.js was successfully patched with a React Suspense fix")
    }
  } catch (err) {
    log.error(JSON.stringify(err, null, 2))
  }

  try {
    await generateManifest()
    log.success("Routes manifest was successfully generated")

    const {dependencies, devDependencies} = await getPackageJson()

    const hasPrisma = Object.keys({...dependencies, ...devDependencies}).some(
      (name) => name === "prisma",
    )

    if (hasPrisma) {
      const foundPrismaClient = resolveFrom.silent(process.cwd(), "@prisma/client")
      const foundDotPrismaClient = resolveFrom.silent(process.cwd(), ".prisma")

      if (
        !foundPrismaClient ||
        (foundPrismaClient && !fs.existsSync(join(foundPrismaClient, "../../..", ".prisma"))) ||
        (foundDotPrismaClient && !foundDotPrismaClient)
      ) {
        let prismaSpinner = log.spinner(`Generating Prisma client`).start()
        const result = await runPrisma(["generate"], true)
        if (typeof result === "object") {
          if (result.success) {
            prismaSpinner.succeed(log.greenText("Generated Prisma client"))
          } else {
            prismaSpinner.fail()
            console.log("\n" + result.stderr)
            process.exit(1)
          }
        }
      }
    }
  } catch (err) {
    log.error(JSON.stringify(err, null, 2))
  }
}
