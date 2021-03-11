module.exports = function ({ types: t }, option) {
  const {
    nameSpace = 'mDocSocket',
    port = '12149',
    enable = true
  } = option || {}
  if (!enable) return {}

  /**
   * get inside function info in methods
   * @param path
   * @param fnList
   */
  function getInsideFns (path, fnList) {
    path.traverse({
      CallExpression (fnPath) {
        const info = fnPath.get('callee').node
        if (info) {
          const { start, end, name, loc } = info
          fnList.push({ start, end, name, loc })
        }
      }
    })
  }

  /**
   * get comment description message
   * @param path
   * @returns {string}
   */
  function getDesc (path) {
    return path.get('leadingComments').reduce((acc, cur) => {
      if (/@(?:desc|func)/.test(cur.node.value)) {
        const value = cur.node.value.replace(/(?:[\s\S]*@(?:desc|func)\s+)(.+)(?:[\S\s]+)?/, '$1')
        acc += value
      }
      return acc
    }, '')
  }

  /**
   * get inside comments
   * @param body
   * @returns {*}
   */
  function getInsideComments (body) {
    return body.filter(item => {
      const leadingComments = item.get('leadingComments')
      if (leadingComments && leadingComments.length) {
        return leadingComments.some(comment => /@inner/.test(comment.node.value))
      } else {
        return false
      }
    }).flatMap(item => item.get('leadingComments'))
  }

  /**
   * get format comments
   * @param path
   * @param variableDeclarator
   */
  function getFormatComments (path, variableDeclarator) {
    const desc = getDesc(path)
    const parentComment = { desc, children: [] }
    let insideComments = []
    if (['FunctionDeclaration', 'ObjectMethod'].includes(path.node.type)) {
      const { name, loc } = path.node.id || path.node.key
      Object.assign(parentComment, { name, loc })
      const body = path.get('body').get('body')
      if (body && body.length) {
        insideComments = getInsideComments(body)
      }
    } else if (path.node.type === 'VariableDeclaration') {
      const { name, loc } = variableDeclarator.get('id').node
      Object.assign(parentComment, { name, loc })
      const body = variableDeclarator.get('init').get('body').get('body')
      if (body && body.length) {
        insideComments = getInsideComments(body)
      }
    }
    if (insideComments && insideComments.length > 0) {
      parentComment.children = insideComments.map(insideComment => {
        const { value, loc } = insideComment.node
        return {
          loc,
          value: value.replace(/(?:[\s\S]*@inner\s+)(.+)/, '$1')
        }
      })
    }
    return parentComment
  }

  /**
   * get expression
   * @param comments
   * @returns {*}
   */
  function getExpression (comments) {
    return t.expressionStatement(
      t.logicalExpression(
        '&&',
        t.logicalExpression(
          '&&',
          t.memberExpression(
            t.identifier('window'),
            t.identifier(nameSpace)
          ),
          t.binaryExpression(
            '===',
            t.memberExpression(
              t.memberExpression(
                t.identifier('window'),
                t.identifier(nameSpace)
              ),
              t.identifier('readyState')
            ),
            t.numericLiteral(1)
          )
        ),
        t.callExpression(
          t.memberExpression(
            t.memberExpression(
              t.identifier('window'),
              t.identifier(nameSpace)
            ),
            t.identifier('send')
          ), [
            t.stringLiteral('RECORD|' + JSON.stringify(comments))
          ]
        )
      )
    )
  }

  /**
   * function handler
   * @param path
   */
  const functionHandler = (path) => {
    const leadingComments = path.get('leadingComments')
    if (leadingComments && leadingComments.length) {
      const fnList = []
      getInsideFns(path, fnList)
      const comments = getFormatComments(path, path.node.body.body)
      const expression = getExpression({ ...comments, fnList })
      path.get('body').unshiftContainer('body', expression)
    }
  }

  /**
   * function expression handler
   * @param path
   */
  const expressionHandler = (path) => {
    const leadingComments = path.get('leadingComments')
    const declarations = path.get('declarations')
    if (leadingComments && declarations) {
      const variableDeclarator = declarations[0]
      const init = variableDeclarator.get('init')
      if (
        variableDeclarator && init &&
        ['FunctionExpression', 'ArrowFunctionExpression'].includes(init.node.type)
      ) {
        const fnList = []
        getInsideFns(path, fnList)
        const comments = getFormatComments(path, variableDeclarator)
        const expression = getExpression({ ...comments, fnList })
        init.get('body').unshiftContainer('body', expression)
      }
    }
  }

  return {
    visitor: {
      Program: {
        enter (path) {
          path.unshiftContainer('body', t.expressionStatement(
            t.assignmentExpression(
              '=',
              t.memberExpression(
                t.identifier('window'),
                t.identifier(nameSpace)
              ),
              t.logicalExpression(
                '||',
                t.memberExpression(
                  t.identifier('window'),
                  t.identifier(nameSpace)
                ),
                t.newExpression(
                  t.identifier('WebSocket'),
                  [
                    t.stringLiteral('ws://localhost:' + port)
                  ]
                )
              )
            )
          ))
        }
      },
      FunctionDeclaration: functionHandler,
      ObjectMethod: functionHandler,
      VariableDeclaration: expressionHandler
    }
  }
}
