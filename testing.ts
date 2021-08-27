import { ObjectType, Field, Int, ID } from "type-graphql";

@ObjectType()
export class Nested {
    @Field()
    name!: string;

    @Field((type) => Int)
    age!: number;

    @Field((type) => [Int])
    arrayField!: number[];
}

@ObjectType()
export class F {
    @Field((type) => Int)
    fa!: number;

    @Field((type) => Int)
    fb!: number;

    @Field((type) => Int)
    fc!: number;
}

@ObjectType()
export class __TMP_CLASS_NAME__ {
    @Field()
    success!: boolean;

    @Field((type) => Int)
    status!: number;

    @Field((type) => Nested)
    nested!: Nested;

    @Field((type) => [Int])
    arrayField!: number[];

    @Field((type) => [F])
    f!: F[];
}
