import { Schema, model, Document } from "mongoose";


export type AttributeType = "text" | "color" | "size" | "number" | "select";


export interface IAttributeValue {
    _id?: string; // let Mongoose auto-generate it
    label: string;
    value?: string;
    meta?: Record<string, any>;
}


export interface IAttribute extends Document {
    name: string; // e.g., "Color"
    code: string; // e.g., "color" (unique, slug)
    type: AttributeType; // UI hint
    values: IAttributeValue[];
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}


const AttributeValueSchema = new Schema<IAttributeValue>(
    {
        label: { type: String, required: true, trim: true },
        value: { type: String, trim: true },
        meta: { type: Schema.Types.Mixed },
    },
    { _id: true }
);


const AttributeSchema = new Schema<IAttribute>(
    {
        name: { type: String, required: true, trim: true },
        code: { type: String, required: true, unique: true, lowercase: true, trim: true },
        type: { type: String, enum: ["text", "color", "size", "number", "select"], default: "text" },
        values: { type: [AttributeValueSchema], default: [] },
        isActive: { type: Boolean, default: true },
    },
    { timestamps: true }
);


// auto-normalize code if name changes and code not manually set
AttributeSchema.pre<IAttribute>("validate", function (next) {
    if (!this.isModified("code") && this.isModified("name")) {
        this.code = this.name
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)+/g, "");
    }
    next();
});


export const Attribute = model<IAttribute>("Attribute", AttributeSchema);