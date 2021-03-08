module.exports = function ({ types: t }, { name, port }) {
  const _name = name || 'mDocSocket'
  const _port = port || 19364
  return {
    visitor: {
      Program: {
        enter (path) {
          path.unshiftContainer('body', t.expressionStatement(t.assignmentExpression(
            '=',
            t.memberExpression(
              t.identifier('window'),
              t.identifier(_name)
            ),
            t.newExpression(
              t.identifier('WebSocket'),
              [
                t.stringLiteral('ws://localhost:' + _port)
              ]
            )
          )))
        }
      },
      FunctionDeclaration (path) {
        if (path.node.leadingComments) {
          const desc = path.node.leadingComments.reduce((acc, cur) => {
            if (/@(?:desc|func)/.test(cur.value)) {
              const value = cur.value.replace(/(?:[\s\S]*@(?:desc|func)\s+)(.+)(?:[\S\s]+)/, '$1')
              acc += value
            }
            return acc
          }, '')
          const { name, loc } = path.node.id
          const funcElement = { name, desc, loc, children: [] }
          if (path.node.body) {
            const insideComments = path.node.body.body.filter(item => {
              if (item.leadingComments) {
                return item.leadingComments.some(comment => /@inner/.test(comment.value))
              } else {
                return false
              }
            }).flatMap(item => item.leadingComments)
            if (insideComments && insideComments.length > 0) {
              funcElement.children = insideComments.map(({ value, loc }) => ({
                loc,
                value: value.replace(/(?:[\s\S]*@inner\s+)(.+)/, '$1')
              }))
            }
          }
          path.get('body').unshiftContainer('body', t.expressionStatement(t.callExpression(
            t.memberExpression(
              t.memberExpression(
                t.identifier('window'),
                t.identifier(_name)
              ),
              t.identifier('send')
            ), [
              t.stringLiteral(JSON.stringify(funcElement))
            ]
          )))
        }
      }
    }
  }
}
