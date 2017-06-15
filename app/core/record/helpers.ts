import { Type } from "@angular/core";

import { RecordSetAttributeError } from "./errors";
import { Record } from "./record";

const attrMetadataKey = "record:attrs";
export const primitives = new Set(["Array", "Number", "String", "Object", "Boolean"]);

export function metadataForRecord(record: Record<any>) {
    return metadataForCtr(record.constructor);
}

function metadataForCtr(ctr: any) {
    const data = Reflect.getMetadata(attrMetadataKey, ctr) || {};
    const parent = Object.getPrototypeOf(ctr.prototype);
    const parentCtr = parent.constructor;
    if (parentCtr.name !== "Record") {
        const parentData = metadataForCtr(parentCtr);
        return { ...parentData, ...data };
    }
    return data;
}

interface TypeMetadata {
    list: boolean;
    type: Type<any>;

}

export function updateTypeMetadata(ctr: Type<any>, attr: string, type: TypeMetadata) {
    const metadata = Reflect.getMetadata(attrMetadataKey, ctr) || {};
    metadata[attr] = type;
    Reflect.defineMetadata(attrMetadataKey, metadata, ctr);
}

export function setProp(ctr: Type<any>, attr: string) {
    Object.defineProperty(ctr.prototype, attr, {
        get: function (this: Record<any>) {
            return (this as any)._map.get(attr) || (this as any)._defaultValues[attr];
        },
        set: function <T>(this: Record<any>, value: T) {
            if ((this as any)._initialized) {
                throw new RecordSetAttributeError(this.constructor, attr);
            } else {
                const defaults = (this as any)._defaultValues;
                defaults[attr] = value;
            }
        },
    });
}