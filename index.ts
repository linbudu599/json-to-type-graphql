import jsonfile from "jsonfile";
import { GraphQLScalarType } from "graphql";
import { capitalCase } from "capital-case";
import { Int } from "type-graphql";
import consola from "consola";
import util from "util";
import {
  DecoratorStructure,
  OptionalKind,
  Project,
  PropertyDeclarationStructure,
  Scope,
  SourceFile,
} from "ts-morph";
import fs from "fs-extra";
import prettier from "prettier";
import { addImportDeclaration, ImportType } from "./ast";
import intersection from "lodash/intersection";
import uniqBy from "lodash/uniqBy";
import remove from "lodash/remove";
import got from "got";

// json schema 2 ts?
// 卧槽，还要处理数组
// TODO: 结合 ObjectType 的配置
// TODO: ? 与 !
// TODO: 配置
// rootClassName
// optional field
// apply ! to all field
// readonly field
// import all decorators
// public keyword
// apply ! to all list decorator types
// id field
// 'Type' suffix

// TODO: 配置选项
// rootClassName -> 最初创建的首个顶层 Class 名
// optional field -> 支持 "a.b.c" ?
// readonly field
// public -> 为所有字段增加 public 关键词
// suffix -> true "Type" string -> 这里就不capital了
// forceNonNullable -> 在对象类型数组中，强制将所有键设置为!
// TODO: 能力支持
// 支持仅 generator 或 仅 parser
// 支持从 请求 生成(by got?)
// prisma 支持? 以后再说呗

const content = jsonfile.readFileSync("./sample.json");

type PossibleFieldType =
  | "string"
  | "boolean"
  | "number"
  | "object"
  | "array"
  | "object_array"
  | string
  | PlainObject;

type PlainObject = Record<string, unknown>;

type OriginObject = Record<string, PossibleFieldType>;

type ProcessedFieldInfoObject = Record<string, ProcessedFieldInfo>;

type ProcessedFieldInfo = {
  type: PossibleFieldType;
  nested: boolean;
  prop: string;
  list: boolean;
  nullable: boolean;
  decoratorReturnType: string | null;
  fields: ProcessedFieldInfoObject | null;
  shared?: boolean;
};

function parser(
  content: OriginObject | OriginObject[]
): ProcessedFieldInfoObject {
  const parsedFieldInfo: ProcessedFieldInfoObject = {};

  if (Array.isArray(content)) {
    const randomItem = content[0];

    parsedFieldInfo["TMP"] =
      typeof randomItem === "object"
        ? {
            type: "Data",
            list: true,
            decoratorReturnType: "Data",
            nested: true,
            nullable: false,
            prop: "data",
            fields: objectArrayParser(content),
          }
        : {
            // 原始类型组成的数组
            type: typeof randomItem,
            nested: false,
            list: true,
            prop: "data",
            nullable: false,
            fields: null,
            decoratorReturnType: typeof randomItem === "number" ? "Int" : null,
          };
    return parsedFieldInfo;
  }

  for (const [k, v] of Object.entries(content)) {
    switch (typeof v) {
      case "symbol":
      case "undefined":
        break;

      case "string":
      case "boolean":
        parsedFieldInfo[k] = {
          type: typeof v as "string" | "boolean" | "number",
          nested: false,
          prop: k,
          nullable: false,
          list: false,
          fields: null,
          decoratorReturnType: null,
        };

        break;

      case "number":
        parsedFieldInfo[k] = {
          type: "number",
          nested: false,
          prop: k,
          nullable: false,
          list: false,
          fields: null,
          decoratorReturnType: "Int",
        };

        break;

      // use Object.toString.call instead
      // numberFieldHandler ...
      // 先处理原始类型数组吧
      // 对于数组：查看是否是同一类型，不是就直接跳掉
      // 对于同一类型 先拿到

      case "object":
        parsedFieldInfo[k] = Array.isArray(v)
          ? typeof v[0] === "object"
            ? {
                type: capitalCase(k, {
                  delimiter: "",
                }),
                list: true,
                decoratorReturnType: capitalCase(k, {
                  delimiter: "",
                }),
                nested: true,
                nullable: false,
                prop: k,
                fields: objectArrayParser(v),
              }
            : {
                // 原始类型组成的数组
                type: arrayItemType(v) as any,
                nested: false,
                list: true,
                prop: k,
                nullable: false,
                fields: null,
                decoratorReturnType:
                  arrayItemType(v) === "number" ? "Int" : null,
              }
          : {
              // 普通对象
              type: capitalCase(k, {
                delimiter: "",
              }),
              nested: true,
              list: false,
              prop: k,
              nullable: false,
              decoratorReturnType: capitalCase(k, {
                delimiter: "",
              }),
              fields: parser(content[k] as OriginObject),
            };
        break;
    }
  }

  return parsedFieldInfo;
}

function arrayItemType<T extends any[]>(arr: T[]) {
  return typeof arr[0];
}

type InferredObjectType = {
  key: string;
  shared: boolean;
  type: PossibleFieldType;
};

type ObjectTypeRecord = {
  abstractType: string;
  contains: InferredObjectType[];
};

//
function objectArrayParser<T extends PlainObject>(
  arr: T[]
): ProcessedFieldInfoObject {
  const keys: string[][] = [];
  const processedKeys: ProcessedFieldInfo[] = [];

  const processedResult: ProcessedFieldInfoObject = {};

  for (const item of arr) {
    keys.push(Object.keys(item));
  }

  // 在所有成员中都存在
  const intersectionKeys = intersection(...keys);

  // 但不一定所有成员中都有值 所以要再次遍历找到一个值为真的

  intersectionKeys.forEach((key) => {
    // 要考虑 0 "" 这种
    const nonNullSharedItem = arr.filter(
      (item) => item[key] === 0 || item[key] === "" || !![item[key]]
    );

    // 如果没有 就置为object！并且 AST 生成的时候加注释

    const nonNullSharedItemType = nonNullSharedItem.length
      ? typeof nonNullSharedItem[0][key]
      : "object";

    // 这个选出来的值应该直接交给 parser 处理
    // 只是把最后的 shared 附加上去？

    // console.log(parser(nonNullSharedItem[0] as OriginObject));

    processedKeys.push({
      ...parser(nonNullSharedItem[0] as OriginObject)[key],
      shared: true,
      nullable: false,
    });
  });

  // 遍历所有对象类型的成员 移除交集中存在的键
  for (const item of arr) {
    intersectionKeys.forEach((key) => {
      key in item && delete item[key];
    });
  }

  // 处理剩下的

  for (const item of arr) {
    for (const [k, v] of Object.entries(item)) {
      processedKeys.push({
        ...parser({ [k]: v } as OriginObject)[k],
        shared: false,
        nullable: true,
      });
    }
  }

  const result = uniqBy(processedKeys, (key) => key.prop);

  result.forEach((item) => {
    processedResult[item.prop] = item;
  });

  return processedResult;
}

fs.rmSync("./testing.ts");
fs.createFileSync("./testing.ts");
const source = new Project().addSourceFileAtPath("./testing.ts");

addImportDeclaration(
  source,
  ["ObjectType", "Field", "Int", "ID"],
  "type-graphql",
  ImportType.NAMED_IMPORTS
);

function generator(
  parsed: ProcessedFieldInfoObject,
  className = "__TMP_CLASS_NAME__"
): void {
  const classDecorator: OptionalKind<DecoratorStructure>[] = [
    {
      name: "ObjectType",
      arguments: [],
    },
  ];
  const properties: OptionalKind<PropertyDeclarationStructure>[] = [];

  for (const [, v] of Object.entries(parsed)) {
    if (v.nested) generator(v.fields!, v.type as string);

    // nullable 为 false 时 [Type]!
    // [Type!] 则由选项控制
    const fieldReturnType: string[] = v.decoratorReturnType
      ? v.list
        ? [`(type) => [${v.decoratorReturnType}]`]
        : [`(type) => ${v.decoratorReturnType}`]
      : [];

    if (v.nullable) fieldReturnType.push(`{ nullable: true }`);

    // 用 reduce 可能更好
    properties.push({
      name: v.prop,
      type: v.list ? `${v.type}[]` : (v.type as string),
      decorators: [
        {
          name: "Field",
          arguments: fieldReturnType,
        },
      ],
      // scope: Scope.Public,
      trailingTrivia: (writer) => writer.newLine(),
      // nullable 为 true 的字段需要加? ，且 @Field 中需要对应的加参数，西内，有点麻烦属实
      hasExclamationToken: !v.nullable,
      hasQuestionToken: v.nullable,
      isReadonly: false,
    });
  }

  source.addClass({
    name: className,
    decorators: classDecorator,
    properties,
    isExported: true,
  });

  source.saveSync();
}

function objectArrayHandler(info: ObjectTypeRecord, classIdentifier: string) {
  // 原 class 需要加上一个 field 指向这个对象类型
  // 为这个field新建一个对象类型
  const classDecorator: OptionalKind<DecoratorStructure>[] = [
    {
      name: "ObjectType",
      arguments: [],
    },
  ];
  const properties: OptionalKind<PropertyDeclarationStructure>[] = [];

  for (const fields of info.contains) {
    properties.push({
      name: fields.key,
      type: fields.type as string,
      decorators: [
        {
          name: "Field",
          arguments: [],
        },
      ],
      // scope: Scope.Public,
      trailingTrivia: (writer) => writer.newLine(),
      hasExclamationToken: true,
      hasQuestionToken: false,
      isReadonly: false,
    });
  }

  source.addClass({
    name: info.abstractType,
    decorators: classDecorator,
    properties,
    isExported: true,
  });
}

// 看起来需要一个专门处理 Record[] 类型的 generator？

function formatter() {}

// 啊这，对于上来就是数组的要咋处理呢

// TODO: 处理这种数组形式

(async () => {
  const res = await got(
    "https://baas-all-demo.pre-fc.alibaba-inc.com/summary?ids=594572481181"
  );

  // console.log(res.body);
  // parser(JSON.parse(res.body));
  // generator(parser(JSON.parse(res.body)[0]));
  generator(parser(JSON.parse(res.body)));
  // consola.log(
  //   util.inspect(parser(JSON.parse(res.body)), {
  //     depth: 999,
  //   })
  // );
})();

// consola.log(
//   util.inspect(parser(content), {
//     depth: 999,
//   })
// );

// generator(parser(content));
//
