"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Product = void 0;
const mongoose_1 = require("mongoose");
const urlValidator = (v) => /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(v);
const isHex24 = (s) => typeof s === "string" && /^[a-fA-F0-9]{24}$/.test(s);
function validateVariantValue(v) {
    if (!v || typeof v !== "object")
        return false;
    if (!isHex24(v.attributeId))
        return false;
    const val = v.attributesValueId;
    const isValidVal = Array.isArray(val)
        ? val.length > 0 && val.every(isHex24)
        : isHex24(val);
    if (!isValidVal)
        return false;
    if (typeof v.stock !== "number" || v.stock < 0)
        return false;
    if (v.imageUrl && !urlValidator(v.imageUrl))
        return false;
    return true;
}
const VariantValueSchema = new mongoose_1.Schema({
    attributeId: {
        type: String,
        required: true,
        validate: { validator: isHex24, message: "attributeId must be 24-hex" },
    },
    attributesValueId: {
        type: mongoose_1.Schema.Types.Mixed,
        required: true,
        validate: {
            validator: (v) => (Array.isArray(v) ? v.length > 0 && v.every(isHex24) : isHex24(v)),
            message: "attributesValueId must be 24-hex string or non-empty array of 24-hex strings",
        },
    },
    stock: { type: Number, min: 0, required: true, default: 0 },
    imageUrl: {
        type: String,
        trim: true,
        validate: { validator: (v) => !v || urlValidator(v), message: "imageUrl must be valid http(s) URL" },
    },
}, { _id: true });
const VariantSchema = new mongoose_1.Schema({
    sku: { type: String, trim: true },
    price: { type: Number, min: 0, required: true },
    salePrice: { type: Number, min: 0 },
    values: {
        type: [VariantValueSchema],
        required: true,
        validate: { validator: (arr) => Array.isArray(arr) && arr.length > 0 && arr.every(validateVariantValue), message: "Invalid values[]" },
    },
    stock: { type: Number, min: 0, required: true },
    imageUrl: {
        type: String,
        trim: true,
        validate: { validator: (v) => !v || urlValidator(v), message: "imageUrl must be valid http(s) URL" },
    },
    barcode: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
}, { _id: true, toJSON: { virtuals: true }, toObject: { virtuals: true } });
// Variant virtuals
VariantSchema.virtual("effectivePrice").get(function () {
    if (typeof this.salePrice === "number")
        return this.salePrice;
    return this.price;
});
VariantSchema.virtual("discountPercent").get(function () {
    const base = this.price;
    const eff = this.effectivePrice;
    if (typeof base === "number" && typeof eff === "number" && base > 0 && eff < base) {
        return Math.round(((base - eff) / base) * 100);
    }
    return 0;
});
const ProductSchema = new mongoose_1.Schema({
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, trim: true },
    brand: { type: String, trim: true },
    category: { type: mongoose_1.Schema.Types.ObjectId, ref: "Category" },
    mainAttributeId: {
        type: String,
        validate: { validator: (v) => !v || isHex24(v), message: "mainAttributeId must be 24-hex" },
    },
    imageUrl: {
        type: String,
        required: true,
        trim: true,
        validate: { validator: urlValidator, message: "imageUrl must be valid http(s) URL" },
    },
    price: { type: Number, min: 0 },
    salePrice: { type: Number, min: 0 },
    offerStart: { type: Date },
    offerEnd: { type: Date },
    currency: { type: String, default: "USD", trim: true, uppercase: true },
    stock: { type: Number, min: 0 },
    variants: { type: [VariantSchema], default: [] },
    isActive: { type: Boolean, default: true },
    totalStock: { type: Number, default: 0 },
}, { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } });
// Indices
ProductSchema.index({ totalStock: 1 });
ProductSchema.index({ price: 1 });
ProductSchema.index({ createdAt: -1 });
// Auto-slug if title changed and slug not manually set
ProductSchema.pre("save", function (next) {
    if (this.isModified("title") && !this.isModified("slug")) {
        this.slug = this.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)+/g, "");
    }
    next();
});
// Integrity & aggregation
ProductSchema.pre("validate", function (next) {
    const hasVariants = this.variants && this.variants.length > 0;
    if (hasVariants) {
        if (!this.mainAttributeId) {
            return next(new Error("Variant product requires 'mainAttributeId'"));
        }
        const everyHasMain = this.variants.every((v) => (v.values || []).some((p) => p.attributeId === this.mainAttributeId));
        if (!everyHasMain) {
            return next(new Error("Every variant must include a value for 'mainAttributeId'"));
        }
        this.totalStock = this.variants.reduce((sum, v) => sum + (v.stock || 0), 0);
        this.stock = undefined;
    }
    else {
        if (typeof this.price !== "number")
            return next(new Error("Simple product requires price"));
        if (typeof this.stock !== "number")
            return next(new Error("Simple product requires stock"));
        this.totalStock = this.stock || 0;
    }
    next();
});
// Product virtuals
ProductSchema.virtual("effectivePrice").get(function () {
    const now = new Date();
    const inWindow = (!this.offerStart || this.offerStart <= now) && (!this.offerEnd || this.offerEnd >= now);
    if (typeof this.salePrice === "number" && inWindow)
        return this.salePrice;
    return this.price;
});
ProductSchema.virtual("discountPercent").get(function () {
    const base = this.price;
    const eff = this.effectivePrice;
    if (typeof base === "number" && typeof eff === "number" && base > 0 && eff < base) {
        return Math.round(((base - eff) / base) * 100);
    }
    return 0;
});
exports.Product = (0, mongoose_1.model)("Product", ProductSchema);
