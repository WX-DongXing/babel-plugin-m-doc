module.exports = function ({ types: t }, option) {
  const {
    nameSpace = 'mDocSocket',
    port = '12149',
    enable = true
  } = option || {}
  if (!enable) return {}

  let file = {}

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
          name && fnList.push({ start, end, name, loc })
        }
      }
    })
  }

  /**
   * get comment
   * @param path
   * @returns {string}
   */
  function getComment (path) {
    return path.get('leadingComments').reduce((acc, cur) => {
      if (/@doc/.test(cur.node.value)) {
        const commentLines = cur.node.value
          .replace(/\*/g, '')
          .match(/.+\n?/g)
          .filter(item => !!item.trim())
        const comment = commentLines.reduce((acc, cur) => {
          if (/@/.test(cur)) {
            const fragments = /.+?@(.+?)\s+[{<]?(.+?)[>}]?\s+?([{<](.+?)[>}]\s+?)?([\s\S]+)/.exec(cur)
            if (fragments && fragments.length === 7) {
              const result = {}
              const [target, classify, param, value, types, type, desc] = fragments
              switch (classify) {
                case 'doc':
                  Object.assign(result, { desc: `${value || ' '}${desc}` })
                  break
                case 'example':
                  Object.assign(result, { [classify]: `${value || ' '}${desc}` })
                  break
                case 'param':
                  Object.assign(result, { [classify]: { type, value, desc } })
                  break
                case 'returns':
                  Object.assign(result, { [classify]: { type: value, desc } })
                  break
                default:
                  break
              }
              acc.push(result)
            }
          } else {
            const preResult = acc[acc.length - 1]
            if (!preResult) {
              return false
            }
            if (preResult.desc) {
              preResult.desc += cur
            } else if (preResult.example) {
              preResult.example += cur
            }
          }
          return acc
        }, []).reduce((acc, cur) => {
          if (cur.param) {
            acc.params.push(cur.param)
          } else {
            Object.assign(acc, cur)
          }
          return acc
        }, { params: [] })
        Object.assign(acc, comment)
      }
      return acc
    }, { file })
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
    const comment = getComment(path)
    const parentComment = { desc: comment.desc, children: [] }
    let insideComments = []
    if (['FunctionDeclaration', 'ObjectMethod'].includes(path.node.type)) {
      const { name, loc } = path.node.id || path.node.key
      Object.assign(parentComment, { name, loc, comment: { name, ...comment } })
      const body = path.get('body').get('body')
      if (body && body.length) {
        insideComments = getInsideComments(body)
      }
    } else if (path.node.type === 'VariableDeclaration') {
      const { name, loc } = variableDeclarator.get('id').node
      Object.assign(parentComment, { name, loc, comment: { name, ...comment } })
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
    if (leadingComments && leadingComments.length && declarations) {
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
        enter (path, state) {
          const { filename, cwd } = state
          file = { filename, cwd }
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
