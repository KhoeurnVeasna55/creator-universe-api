"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminProductController = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const product_model_1 = require("../models/product.model");
const attribute_model_1 = require("../../attribute/models/attribute.model");
const isHex24 = (s) => typeof s === "string" && /^[a-fA-F0-9]{24}$/.test(s);
const toArray = (v) => (Array.isArray(v) ? v : [v]);
class AdminProductController {
    constructor() {
        // ===== LIST (admin; minimal shape) ========================================
        this.list = async (req, res) => {
            try {
                const page = Math.max(parseInt(String(req.query.page ?? "1"), 10), 1);
                const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? "12"), 10), 1), 100);
                const search = String(req.query.search ?? "").trim();
                const brand = String(req.query.brand ?? "").trim();
                const category = String(req.query.category ?? "").trim();
                const inStock = String(req.query.inStock ?? "").toLowerCase() === "true";
                const hasVariantsQ = req.query.hasVariants;
                const minPrice = req.query.minPrice ? Number(req.query.minPrice) : undefined;
                const maxPrice = req.query.maxPrice ? Number(req.query.maxPrice) : undefined;
                const sort = String(req.query.sort ?? "-createdAt");
                const filter = {};
                if (search) {
                    filter.$or = [
                        { title: { $regex: search, $options: "i" } },
                        { description: { $regex: search, $options: "i" } },
                        { brand: { $regex: search, $options: "i" } },
                    ];
                }
                if (brand)
                    filter.brand = { $regex: `^${brand}$`, $options: "i" };
                if (category && mongoose_1.default.isValidObjectId(category))
                    filter.category = category;
                if (inStock)
                    filter.totalStock = { $gt: 0 };
                if (typeof hasVariantsQ !== "undefined") {
                    const val = String(hasVariantsQ).toLowerCase();
                    if (val === "true")
                        filter["variants.0"] = { $exists: true };
                    else if (val === "false")
                        filter["variants"] = { $size: 0 };
                }
                if (typeof minPrice === "number") {
                    filter.$and = filter.$and || [];
                    filter.$and.push({
                        $or: [
                            { salePrice: { $exists: true, $gte: minPrice } },
                            { price: { $gte: minPrice } },
                            { variants: { $elemMatch: { salePrice: { $exists: true, $gte: minPrice } } } },
                            { variants: { $elemMatch: { price: { $gte: minPrice } } } },
                        ],
                    });
                }
                if (typeof maxPrice === "number") {
                    filter.$and = filter.$and || [];
                    filter.$and.push({
                        $or: [
                            { salePrice: { $exists: true, $lte: maxPrice } },
                            { price: { $lte: maxPrice } },
                            { variants: { $elemMatch: { salePrice: { $exists: true, $lte: maxPrice } } } },
                            { variants: { $elemMatch: { price: { $lte: maxPrice } } } },
                        ],
                    });
                }
                const dir = sort.startsWith("-") ? -1 : 1;
                const field = sort.replace(/^-/, "");
                const sortSpec = { [field]: dir };
                const total = await product_model_1.Product.countDocuments(filter);
                const items = await product_model_1.Product.aggregate([
                    { $match: filter },
                    { $sort: sortSpec },
                    { $skip: (page - 1) * limit },
                    { $limit: limit },
                    {
                        $addFields: {
                            hasVariants: { $gt: [{ $size: { $ifNull: ["$variants", []] } }, 0] }
                        }
                    },
                    {
                        $project: {
                            _id: 1,
                            title: 1,
                            slug: 1,
                            brand: 1,
                            imageUrl: 1,
                            currency: 1,
                            category: 1,
                            isActive: 1,
                            totalStock: 1,
                            mainAttributeId: 1,
                            hasVariants: 1,
                            createdAt: 1,
                            updatedAt: 1
                        }
                    }
                ]);
                return res.json({
                    items,
                    page,
                    limit,
                    total,
                    pages: Math.ceil(total / limit)
                });
            }
            catch (err) {
                console.error("Admin list products error:", err);
                return res.status(500).json({ message: "Failed to list products" });
            }
        };
        // ===== CREATE (admin; no mainBuild) =======================================
        this.create = async (req, res) => {
            try {
                const payload = req.body;
                // normalize slug
                if (payload.slug) {
                    payload.slug = String(payload.slug)
                        .toLowerCase()
                        .trim()
                        .replace(/[^a-z0-9]+/g, "-")
                        .replace(/(^-|-$)+/g, "");
                }
                // normalize category
                if (payload.category && typeof payload.category === "string" && mongoose_1.default.isValidObjectId(payload.category)) {
                    payload.category = new mongoose_1.default.Types.ObjectId(payload.category);
                }
                const product = await product_model_1.Product.create(payload);
                return res.status(201).json(product);
            }
            catch (err) {
                if (err?.code === 11000) {
                    return res.status(409).json({ message: "Duplicate slug or unique field" });
                }
                console.error("Admin create product error:", err);
                return res.status(500).json({ message: "Failed to create product", details: err?.message });
            }
        };
        // ===== GET ONE (admin; flat with resolved variants) =======================
        this.getOne = async (req, res) => {
            try {
                const { idOrSlug } = req.params;
                const query = /^[a-f\d]{24}$/i.test(idOrSlug) ? { _id: idOrSlug } : { slug: idOrSlug.toLowerCase() };
                const product = await product_model_1.Product.findOne(query).lean();
                if (!product)
                    return res.status(404).json({ message: "Product not found" });
                // Resolve attributes/values so variants are UI-ready
                const attrIdSet = new Set();
                for (const v of product.variants ?? []) {
                    for (const p of v.values ?? [])
                        attrIdSet.add(p.attributeId);
                }
                const attrIds = Array.from(attrIdSet);
                const attributes = attrIds.length ? await attribute_model_1.Attribute.find({ _id: { $in: attrIds } }).lean() : [];
                const attrById = new Map();
                const valByAttrId = new Map();
                for (const a of attributes) {
                    const id = String(a._id);
                    attrById.set(id, { _id: id, name: a.name, code: a.code, type: a.type, isActive: a.isActive });
                    const vmap = new Map();
                    for (const v of a.values ?? []) {
                        vmap.set(String(v._id), { _id: String(v._id), label: v.label, value: v.value, meta: v.meta ?? null });
                    }
                    valByAttrId.set(id, vmap);
                }
                const resolvedVariants = (product.variants ?? []).map((v) => {
                    const attributesResolved = (v.values ?? []).map((pair) => {
                        const attrInfo = attrById.get(pair.attributeId) ?? { _id: pair.attributeId, name: null, code: null, type: null, isActive: null };
                        const valueIds = toArray(pair.attributesValueId);
                        const values = valueIds.map((vid) => valByAttrId.get(pair.attributeId)?.get(vid) ?? { _id: vid, label: null, value: null, meta: null });
                        return {
                            attribute: attrInfo,
                            values,
                            stock: pair.stock ?? null,
                            imageUrl: pair.imageUrl ?? null,
                        };
                    });
                    return {
                        _id: String(v._id),
                        sku: v.sku ?? null,
                        price: v.price,
                        salePrice: v.salePrice ?? null,
                        stock: v.stock,
                        imageUrl: v.imageUrl ?? null,
                        barcode: v.barcode ?? null,
                        effectivePrice: v.effectivePrice ?? null,
                        discountPercent: v.discountPercent ?? 0,
                        attributesResolved,
                    };
                });
                const { variants: _dropRaw, ...flat } = product;
                return res.json({
                    ...flat,
                    variants: resolvedVariants
                });
            }
            catch (err) {
                console.error("Admin get product error:", err);
                return res.status(500).json({ message: "Failed to fetch product" });
            }
        };
        // ===== UPDATE (admin; POST, not PATCH) ====================================
        this.update = async (req, res) => {
            try {
                const { idOrSlug } = req.params;
                const body = req.body;
                const query = /^[a-f\d]{24}$/i.test(idOrSlug) ? { _id: idOrSlug } : { slug: idOrSlug.toLowerCase() };
                const product = await product_model_1.Product.findOne(query);
                if (!product)
                    return res.status(404).json({ message: "Product not found" });
                if (typeof body.mainBuild !== "undefined") {
                    return res.status(400).json({ message: "mainBuild is no longer supported in update." });
                }
                [
                    "title",
                    "description",
                    "brand",
                    "currency",
                    "price",
                    "salePrice",
                    "offerStart",
                    "offerEnd",
                    "stock",
                    "isActive",
                    "imageUrl",
                    "mainAttributeId",
                ].forEach((k) => {
                    if (typeof body[k] !== "undefined")
                        product[k] = body[k];
                });
                if (typeof body.slug !== "undefined" && String(body.slug).trim()) {
                    product.slug = String(body.slug)
                        .toLowerCase()
                        .trim()
                        .replace(/[^a-z0-9]+/g, "-")
                        .replace(/(^-|-$)+/g, "");
                }
                if (typeof body.category !== "undefined") {
                    if (body.category && mongoose_1.default.isValidObjectId(body.category)) {
                        product.category = new mongoose_1.default.Types.ObjectId(body.category);
                    }
                    else if (body.category === null) {
                        // allow clearing category
                        product.category = undefined;
                    }
                }
                if (typeof body.variants !== "undefined") {
                    product.variants = body.variants; // full replacement
                }
                await product.save();
                return res.json(product);
            }
            catch (err) {
                if (err?.code === 11000) {
                    return res.status(409).json({ message: "Duplicate slug or unique field" });
                }
                console.error("Admin update product error:", err);
                return res.status(500).json({ message: "Failed to update product", details: err?.message });
            }
        };
        // ===== BULK DELETE (admin; POST /delete) ==================================
        this.bulkDelete = async (req, res) => {
            try {
                const { ids } = req.body;
                if (!Array.isArray(ids) || ids.length === 0) {
                    return res.status(400).json({ message: "Body must include non-empty 'ids' array" });
                }
                // Convert each ID: if it's a valid ObjectId, wrap it, otherwise keep string
                const parsedIds = ids.map(id => mongoose_1.default.Types.ObjectId.isValid(id) ? new mongoose_1.default.Types.ObjectId(id) : id);
                const result = await product_model_1.Product.deleteMany({ _id: { $in: parsedIds } });
                if (!result.deletedCount) {
                    return res.status(404).json({ message: "Product not found", ids: parsedIds });
                }
                return res.json({ deletedCount: result.deletedCount, ids: parsedIds });
            }
            catch (err) {
                console.error("Admin bulk delete products error:", err);
                return res.status(500).json({ message: "Failed to delete products" });
            }
        };
    }
}
exports.AdminProductController = AdminProductController;
exports.default = AdminProductController;
