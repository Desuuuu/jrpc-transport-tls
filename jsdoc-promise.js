module.exports.defineTags = function(dictionary) {
  dictionary.defineTag('promise', {
    canHaveType: true,
    canHaveName: false,
    onTagged(doclet, tag) {
      doclet.promise = tag.value;
    }
  });

  dictionary.defineTag('resolve', {
    canHaveType: false,
    canHaveName: false,
    mustHaveValue: true,
    onTagged(doclet, tag) {
      doclet.resolves = doclet.resolves || [];

      doclet.resolves.push(tag.value);
    }
  }).synonym('resolves');

  dictionary.defineTag('reject', {
    canHaveType: false,
    canHaveName: false,
    mustHaveValue: true,
    onTagged(doclet, tag) {
      doclet.rejects = doclet.rejects || [];

      doclet.rejects.push(tag.value);
    }
  }).synonym('rejects');
};

module.exports.handlers = {
  newDoclet(e) {
    if (e.doclet.promise) {
      let returns = e.doclet.promise;

      if (!returns.type) {
        returns.type = {
          names: [ 'Promise' ]
        };
      }

      if (!returns.description) {
        returns.description = '';
      }

      let extraInfos = [];

      if (e.doclet.resolves && e.doclet.resolves.length) {
        extraInfos = extraInfos.concat(e.doclet.resolves.map(formatSymbolInfo.bind(undefined, 'Resolve')).filter(x => x));
      }

      if (e.doclet.rejects && e.doclet.rejects.length) {
        extraInfos = extraInfos.concat(e.doclet.rejects.map(formatSymbolInfo.bind(undefined, 'Reject')).filter(x => x));
      }

      if (extraInfos.length) {
        returns.description += '<p></p><div class="pad-left"><ul><li>' + extraInfos.join('</li><li>') + '</li></ul></div>';
      }

      e.doclet.returns = [ returns ];

      e.doclet.tags = e.doclet.tags || [];

      e.doclet.tags.push({
        originalTitle: 'promise',
        title: 'promise',
        text: ''
      });
    }
  }
};

function formatSymbolInfo(caption, description) {
  description = formatDescription((description || '').trim());

  if (!description) {
    return false;
  }

  return `<b class="caption">${caption}:</b> ${description}`;
}

function formatDescription(description) {
  let matches = description.match(/^({[^}]*})?(.+)?$/i);

  if (!matches || matches.length !== 3) {
    return false;
  }

  let type = matches[1];
  let link;
  let text = (matches[2] || '').trim();

  if (type) {
    let parts = type.substr(1, type.length - 2).split(' ', 2);

    if (parts && parts.length) {
      type = parts[0];

      if (parts.length > 1) {
        link = parts[1];
      }
    } else {
      type = '';
    }
  }

  if (type) {
    if (link) {
      type = `\`{@link ${link}|${type}}\``;
    } else {
      type = `\`${type}\``;
    }
  } else if (!text) {
    return false;
  } else {
    type = '— ';
  }

  if (text) {
    text = `&nbsp;&nbsp;—&nbsp;&nbsp;${text}`;
  }

  return `${type}${text}`;
}
