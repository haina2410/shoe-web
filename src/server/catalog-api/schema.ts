import { z } from "zod";
import {
  createProductInputSchema,
  productInputSchema,
  variantInputSchema,
} from "@/lib/validation/product";

const integer = z.number().int().min(0).max(2147483647);
const identifier = z.string().trim().min(1).max(100);
export const catalogProductSchema = z
  .strictObject({
    product: productInputSchema
      .extend({
        name: z.string().trim().min(1).max(200),
        description: z.string().max(10000).optional(),
        categoryId: identifier,
        basePrice: integer,
        status: z.literal("DRAFT").default("DRAFT"),
      })
      .strict(),
    variants: z
      .array(
        variantInputSchema
          .extend({
            size: z.string().trim().min(1).max(40),
            color: z.string().trim().min(1).max(80),
            sku: identifier,
            stock: integer,
            priceOverride: integer.nullable().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(100),
    imageSets: z
      .array(
        z.strictObject({
          color: z.string().trim().min(1).max(80),
          position: integer,
          isDefault: z.boolean(),
          images: z
            .array(z.strictObject({ assetId: identifier, position: integer }))
            .min(1)
            .max(10),
        }),
      )
      .max(20)
      .default([]),
  })
  .superRefine((input, ctx) => {
    const validation = createProductInputSchema.safeParse({
      ...input,
      imageSets: input.imageSets.map((set) => ({
        ...set,
        images: set.images.map((image) => ({
          url: image.assetId,
          position: image.position,
        })),
      })),
    });
    if (!validation.success) {
      for (const issue of validation.error.issues)
        ctx.addIssue({
          code: "custom",
          path: issue.path,
          message: issue.message,
        });
    }
    const combinations = input.variants.map((variant) =>
      JSON.stringify([variant.size, variant.color]),
    );
    if (new Set(combinations).size !== combinations.length)
      ctx.addIssue({
        code: "custom",
        path: ["variants"],
        message: "Size and color combinations must be unique",
      });
    const skus = input.variants.map((variant) => variant.sku);
    if (new Set(skus).size !== skus.length)
      ctx.addIssue({
        code: "custom",
        path: ["variants"],
        message: "SKUs must be unique within a product",
      });
  });
export type CatalogProductInput = z.infer<typeof catalogProductSchema>;

export const catalogVariantSchema = catalogProductSchema.shape.variants.element;
export type CatalogVariantInput = z.infer<typeof catalogVariantSchema>;

export const catalogProductUpdateSchema = z
  .strictObject({
    product: z
      .strictObject({
        name: z.string().trim().min(1).max(200).optional(),
        description: z.string().max(10000).nullable().optional(),
        categoryId: identifier.optional(),
        basePrice: integer.optional(),
        status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).optional(),
      })
      .refine(
        (value) => Object.keys(value).length > 0,
        "Provide a product field",
      )
      .optional(),
    imageSets: catalogProductSchema.shape.imageSets.unwrap().optional(),
  })
  .superRefine((input, ctx) => {
    if (!input.product && input.imageSets === undefined)
      ctx.addIssue({
        code: "custom",
        message: "Provide product fields or imageSets",
      });
    if (input.imageSets) {
      const colors = input.imageSets.map((set) => set.color);
      if (new Set(colors).size !== colors.length)
        ctx.addIssue({
          code: "custom",
          path: ["imageSets"],
          message: "Image set colors must be unique",
        });
      if (
        input.imageSets.length &&
        input.imageSets.filter((set) => set.isDefault).length !== 1
      )
        ctx.addIssue({
          code: "custom",
          path: ["imageSets"],
          message: "Exactly one default image set is required",
        });
    }
  });
export type CatalogProductUpdateInput = z.infer<
  typeof catalogProductUpdateSchema
>;
