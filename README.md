# TODO

- AST 看起来只需要 add named import？但留着可以提高逼格
- import 方法也可以专门优化下
- 新增 直接更新 导入成员的 ast 方法
- formatter 还能做什么？
- √ data Data -> constant
- 优化 objectArrayParser
- 支持 parser 和 generator 的选项
- 支持 数组 嵌套 数组，理论上这种会被归到 Object_Array
- AST findExistClass
- 修正类型
- √ 生成顺序，感觉可以和标识符重复一起解决
- √ 标识符重复还没解决？需要在 parser 阶段解决啊
- √ 支持另一种生成顺序？我直接好家伙
- 注释
- a:[[]]? -> 抛弃
- TS Doc
- postprocesser -> 检查装饰器、额外的操作
- 支持在 pre/post processer 阶段进行额外的处理
- 只有最外层的几个 用 or 的命名
- 生成最后一个，再。。
- forceNonNullListItem
- 也可以通过 干预 preprocesser 来处理类名重复
