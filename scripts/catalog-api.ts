import "dotenv/config";
import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { prisma } from "../src/lib/prisma";
import {
  issueCatalogToken,
  revokeCatalogToken,
  catalogScopes,
  type CatalogScope,
} from "../src/server/catalog-api/tokens";
import { cleanupCatalogImages } from "../src/server/catalog-api/images";

async function main() {
  const { values, positionals } = parseArgs({
    options: {
      "owner-email": { type: "string" },
      name: { type: "string" },
      days: { type: "string", default: "30" },
      scopes: { type: "string", default: catalogScopes.join(",") },
      out: { type: "string" },
      id: { type: "string" },
      help: { type: "boolean" },
    },
    allowPositionals: true,
  });
  const [command] = positionals;
  if (values.help) {
    console.log(
      `catalog:api issue --owner-email EMAIL --name NAME --out PRIVATE_FILE [--days 30] [--scopes ${catalogScopes.join(",")}]\ncatalog:api list\ncatalog:api revoke --id ID\ncatalog:api cleanup-images`,
    );
    return;
  }
  if (positionals.length !== 1)
    throw new Error("Specify one command: issue, list, revoke, cleanup-images");
  if (command === "issue") {
    if (!values["owner-email"] || !values.name || !values.out)
      throw new Error("issue requires --owner-email, --name and --out");
    const days = Number(values.days);
    if (!Number.isInteger(days) || days < 1 || days > 90)
      throw new Error("--days must be between 1 and 90");
    const scopes = values.scopes!.split(",");
    if (
      !scopes.length ||
      scopes.some((scope) => !catalogScopes.includes(scope as CatalogScope))
    )
      throw new Error("Invalid --scopes");
    const owner = await prisma.user.findUnique({
      where: { email: values["owner-email"] },
      select: { id: true },
    });
    if (!owner) throw new Error("Owner account not found");
    const credential = await issueCatalogToken(prisma, {
      ownerId: owner.id,
      name: values.name,
      scopes: [...new Set(scopes)] as CatalogScope[],
      expiresAt: new Date(Date.now() + days * 86400000),
    });
    try {
      await writeFile(values.out, JSON.stringify(credential, null, 2) + "\n", {
        mode: 0o600,
        flag: "wx",
      });
    } catch {
      await revokeCatalogToken(prisma, credential.id);
      throw new Error(
        "Could not create credential file; issued credential revoked. Choose a new private output path.",
      );
    }
    console.log(
      JSON.stringify({
        id: credential.id,
        expiresAt: credential.expiresAt,
        saved: true,
      }),
    );
  } else if (command === "list") {
    console.log(
      JSON.stringify(
        await prisma.catalogApiToken.findMany({
          select: {
            id: true,
            name: true,
            owner: { select: { email: true } },
            scopes: true,
            expiresAt: true,
            revokedAt: true,
            lastUsedAt: true,
          },
          orderBy: { createdAt: "desc" },
        }),
        null,
        2,
      ),
    );
  } else if (command === "revoke") {
    if (!values.id) throw new Error("revoke requires --id");
    console.log(JSON.stringify(await revokeCatalogToken(prisma, values.id)));
  } else if (command === "cleanup-images") {
    console.log(JSON.stringify(await cleanupCatalogImages(prisma)));
  } else {
    throw new Error("Unknown command; use --help");
  }
}

main()
  .catch(() => {
    console.error(
      "Catalog API command failed. Check arguments, owner access, database connectivity, and output permissions. Use --help for usage.",
    );
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
