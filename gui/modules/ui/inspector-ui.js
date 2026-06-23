export function createInspectorUI(deps) {
  const {
    nodes,
    conflicts,
    state,
    dom,
    normalizeSelectedNodeIds,
    getSelectedNode,
    getSelectedEdge,
    getNodeLayerContent,
    hasConflict,
    isMirrorNode,
    getEdgeRelationExpr,
    setSingleNodeSelection,
    setSingleEdgeSelection,
    focusNode,
    pushHistory,
    updateTopbar,
    rebuildSidebar,
    render,
    setStatus,
    normalizeColorIndex,
    isNodeNameAvailable,
    getNodeRelations,
    t,
  } = deps;

  const {
    emptySelection,
    editorForm,
    edgeEditor,
    blockBindingPanel,
    edgeList,
    validationList,
    auditList,
    edgePathStyleField,
    edgeStrokeStyleField,
    edgeArrowFromField,
    edgeArrowToField,
    edgeDescriptionField,
    edgeVisualControls,
    fieldName,
    fieldSummary,
    fieldDetail,
    fieldStatus,
    fieldColorIndex,
    fieldExpectedRevision,
    blockBinding,
    includeGuard,
    lockMessage,
  } = dom;

  function setEditorLocked(locked, message) {
    const controls = [fieldDetail, fieldStatus, fieldColorIndex].filter(Boolean);
    controls.forEach((el) => { el.disabled = locked; });
    lockMessage.textContent = message;
    lockMessage.classList.toggle('hidden', !message);
  }

  function renderRightPanel() {
    normalizeSelectedNodeIds();
    const selectedCount = state.selectedNodeIds.size;
    const selected = selectedCount === 1 ? getSelectedNode() : null;
    const selectedEdge = selectedCount > 1 ? null : getSelectedEdge();
    const hasNodeSelection = Boolean(selected);

    emptySelection.classList.toggle('hidden', hasNodeSelection || Boolean(selectedEdge));
    editorForm.classList.toggle('hidden', !hasNodeSelection);
    edgeEditor.classList.toggle('hidden', !selectedEdge);
    blockBindingPanel.classList.toggle('hidden', !hasNodeSelection);

    if (selectedCount > 1) {
      emptySelection.classList.remove('hidden');
      emptySelection.innerHTML = `<strong>${t('inspector.multiSelect.title', { count: selectedCount })}</strong><p>${t('inspector.multiSelect.body')}</p>`;
      edgeList.innerHTML = '';
      if (validationList) validationList.innerHTML = '';
      if (auditList) auditList.innerHTML = '';
      edgePathStyleField.value = 'straight';
      edgeStrokeStyleField.value = 'solid';
      edgeDescriptionField.value = '';
      return;
    }

    emptySelection.innerHTML = `<strong>${t('inspector.empty.title')}</strong><p>${t('inspector.empty.bodyCanvas')}</p>`;

    if (!selected) {
      fieldName.disabled = false;
      fieldSummary.disabled = false;
      if (fieldColorIndex) fieldColorIndex.disabled = false;
      setEditorLocked(false, '');
      blockBinding.innerHTML = '';
      if (includeGuard) {
        includeGuard.textContent = t('inspector.bindings.none');
        includeGuard.classList.remove('protected');
      }
      if (validationList) validationList.innerHTML = '';
      if (auditList) auditList.innerHTML = '';

      edgeList.innerHTML = '';
      if (selectedEdge) {
        const nodeA = nodes.find((n) => n.id === selectedEdge.from);
        const nodeB = nodes.find((n) => n.id === selectedEdge.to);
        const A = nodeA ? nodeA.name : selectedEdge.from;
        const B = nodeB ? nodeB.name : selectedEdge.to;
        edgePathStyleField.value = selectedEdge.pathStyle || 'straight';
        edgeStrokeStyleField.value = selectedEdge.strokeStyle || 'solid';
        edgeArrowFromField.checked = Boolean(selectedEdge.arrowFrom);
        edgeArrowToField.checked = Boolean(selectedEdge.arrowTo);
        edgeDescriptionField.value = selectedEdge.description || '';

        const visualRelation = selectedEdge.type !== 'containment' && selectedEdge.type !== 'mirror';
        edgeVisualControls.classList.toggle('hidden', !visualRelation);

        const li = document.createElement('li');
        li.innerHTML = `
          <div><strong>A</strong> = <span class="edge-endpoint" data-node-id="${selectedEdge.from}">${A}</span></div>
          <div><strong>B</strong> = <span class="edge-endpoint" data-node-id="${selectedEdge.to}">${B}</span></div>
        `;

        li.querySelectorAll('.edge-endpoint').forEach((el) => {
          el.ondblclick = () => {
            const nodeId = el.dataset.nodeId;
            const node = nodes.find((n) => n.id === nodeId);
            if (!node) return;
            setSingleNodeSelection(node.id);
            focusNode(node);
            setStatus(t('inspector.status.selectedNodeFromRelationEndpoint', { name: node.name }));
            render();
            rebuildSidebar();
            renderRightPanel();
          };
        });

        edgeList.appendChild(li);
      } else {
        edgePathStyleField.value = 'straight';
        edgeStrokeStyleField.value = 'solid';
        edgeArrowFromField.checked = false;
        edgeArrowToField.checked = false;
        edgeDescriptionField.value = '';
        edgeVisualControls.classList.remove('hidden');
        const li = document.createElement('li');
        li.textContent = t('inspector.edgeConnections.none');
        edgeList.appendChild(li);
      }
      return;
    }

    const layerData = getNodeLayerContent(selected);
    fieldName.value = selected.name;
    fieldSummary.value = layerData.synopsis;
    fieldDetail.value = layerData.detail;
    if (fieldStatus) fieldStatus.value = layerData.status;
    if (fieldColorIndex) fieldColorIndex.value = String(normalizeColorIndex(selected.colorIndex));
    fieldExpectedRevision.value = String(selected.revision);

    const mirrorNode = isMirrorNode(selected);
    fieldName.disabled = mirrorNode;
    fieldSummary.disabled = mirrorNode;

    const conflict = hasConflict(selected.id);
    if (conflict) {
      setEditorLocked(true, t('inspector.lock.conflict'));
    } else {
      setEditorLocked(false, '');
    }

    const selectedLayerContent = getNodeLayerContent(selected);
    const bindings = Array.isArray(selectedLayerContent.resourceBindings) ? selectedLayerContent.resourceBindings : [];
    blockBinding.innerHTML = '';
    if (bindings.length === 0) {
      const li = document.createElement('li');
      li.textContent = t('inspector.bindings.empty');
      blockBinding.appendChild(li);
    } else {
      bindings.forEach((binding, index) => {
        const li = document.createElement('li');
        li.className = 'binding-item';

        const pathLabel = document.createElement('label');
        const pathSpan = document.createElement('span');
        pathSpan.textContent = t('inspector.bindings.path');
        const pathInput = document.createElement('input');
        pathInput.className = 'binding-path-input';
        pathInput.value = binding.path || '';
        pathLabel.append(pathSpan, pathInput);

        const descLabel = document.createElement('label');
        const descSpan = document.createElement('span');
        descSpan.textContent = t('inspector.bindings.description');
        const descInput = document.createElement('input');
        descInput.className = 'binding-description-input';
        descInput.value = binding.description || '';
        descLabel.append(descSpan, descInput);

        const removeRow = document.createElement('div');
        removeRow.className = 'row';
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'binding-remove';
        removeBtn.dataset.bindingIndex = String(index);
        removeBtn.textContent = t('inspector.action.removeBinding');
        removeRow.appendChild(removeBtn);

        const commitField = (field, value) => commitResourceBindingEdit(index, field, value);
        pathInput.addEventListener('change', () => commitField('path', pathInput.value));
        pathInput.addEventListener('blur', () => commitField('path', pathInput.value));
        descInput.addEventListener('change', () => commitField('description', descInput.value));
        descInput.addEventListener('blur', () => commitField('description', descInput.value));

        li.append(pathLabel, descLabel, removeRow);
        blockBinding.appendChild(li);
      });
    }

    if (includeGuard) {
      includeGuard.textContent = t('inspector.bindings.count', { count: bindings.length });
      includeGuard.classList.remove('protected');
    }

    blockBinding.querySelectorAll('.binding-remove').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = getSelectedNode();
        if (!target) return;
        const targetLayerContent = getNodeLayerContent(target);
        const targetBindings = Array.isArray(targetLayerContent.resourceBindings) ? targetLayerContent.resourceBindings : [];
        const index = Number(btn.dataset.bindingIndex);
        if (!Number.isInteger(index) || index < 0 || index >= targetBindings.length) return;
        pushHistory();
        targetBindings.splice(index, 1);
        targetLayerContent.resourceBindings = targetBindings;
        target.dirty = true;
        target.revision += 1;
        fieldExpectedRevision.value = String(target.revision);
        setStatus(t('inspector.status.bindingRemoved', { name: target.name }));
        updateTopbar();
        rebuildSidebar();
        renderRightPanel();
        render();
      });
    });

    edgePathStyleField.value = 'straight';
    edgeStrokeStyleField.value = 'solid';
    edgeArrowFromField.checked = false;
    edgeArrowToField.checked = false;
    edgeDescriptionField.value = '';
    edgeVisualControls.classList.remove('hidden');

    const connectedRelations = getNodeRelations(selected.id);
    edgeList.innerHTML = '';
    if (connectedRelations.length === 0) {
      const li = document.createElement('li');
      li.textContent = t('inspector.edgeConnections.none');
      edgeList.appendChild(li);
    } else {
      for (const relation of connectedRelations) {
        const li = document.createElement('li');

        const nodeA = nodes.find((n) => n.id === relation.from);
        const nodeB = nodes.find((n) => n.id === relation.to);
        const A = nodeA ? nodeA.name : relation.from;
        const B = nodeB ? nodeB.name : relation.to;

        li.innerHTML = `
          <div><strong>${t('inspector.edgeInline.a')}</strong> = <span class="edge-endpoint" data-node-id="${relation.from}">${A}</span></div>
          <div><strong>${t('inspector.edgeInline.b')}</strong> = <span class="edge-endpoint" data-node-id="${relation.to}">${B}</span></div>
          <div><strong>${t('inspector.edgeInline.description')}</strong> = "${relation.description || ''}"</div>
        `;

        li.ondblclick = () => {
          setSingleEdgeSelection(relation.id);
          setStatus(t('inspector.status.selectedRelationFromInspector', { id: relation.id }));
          render();
          rebuildSidebar();
          renderRightPanel();
        };

        li.querySelectorAll('.edge-endpoint').forEach((el) => {
          el.ondblclick = (evt) => {
            evt.stopPropagation();
            const nodeId = el.dataset.nodeId;
            const node = nodes.find((n) => n.id === nodeId);
            if (!node) return;
            setSingleNodeSelection(node.id);
            focusNode(node);
            setStatus(t('inspector.status.selectedNodeFromRelationEndpoint', { name: node.name }));
            render();
            rebuildSidebar();
            renderRightPanel();
          };
        });

        edgeList.appendChild(li);
      }
    }

    if (validationList) {
      validationList.innerHTML = '';
      for (const item of selected.validation) {
        const li = document.createElement('li');
        li.className = `level-${item.level}`;
        li.textContent = `[${item.level.toUpperCase()}] ${item.message}`;
        validationList.appendChild(li);
      }
    }

    if (auditList) {
      auditList.innerHTML = '';
      for (const item of selected.audit) {
        const li = document.createElement('li');
        li.textContent = `${item.time} ? ${item.actor} ? ${item.tool} ? ${item.target}`;
        auditList.appendChild(li);
      }
    }
  }

  function applyEdgeEditorChanges() {
    const edge = getSelectedEdge();
    if (!edge) return;

    return updateEdgeByParams({
      edgeId: edge.id,
      pathStyle: edgePathStyleField.value || 'straight',
      strokeStyle: edgeStrokeStyleField.value || 'solid',
      arrowFrom: Boolean(edgeArrowFromField.checked),
      arrowTo: Boolean(edgeArrowToField.checked),
      description: (edgeDescriptionField.value || '').trim(),
    });
  }

  function updateEdgeByParams(params = {}) {
    const edgeId = String(params.edgeId || '').trim();
    let edge = edgeId ? nodes.length >= 0 && state.selectedEdgeId === edgeId ? getSelectedEdge() : null : null;
    if (!edge && typeof deps.getEdgeById === 'function' && edgeId) edge = deps.getEdgeById(edgeId);
    if (!edge) edge = getSelectedEdge();
    if (!edge) throw new Error(edgeId ? `edge not found: ${edgeId}` : 'no edge selected');

    const pathStyle = Object.prototype.hasOwnProperty.call(params, 'pathStyle')
      ? String(params.pathStyle || 'straight')
      : (edge.pathStyle || 'straight');
    const strokeStyle = Object.prototype.hasOwnProperty.call(params, 'strokeStyle')
      ? String(params.strokeStyle || 'solid')
      : (edge.strokeStyle || 'solid');
    const arrowFrom = Object.prototype.hasOwnProperty.call(params, 'arrowFrom')
      ? Boolean(params.arrowFrom)
      : Boolean(edge.arrowFrom);
    const arrowTo = Object.prototype.hasOwnProperty.call(params, 'arrowTo')
      ? Boolean(params.arrowTo)
      : Boolean(edge.arrowTo);
    const description = Object.prototype.hasOwnProperty.call(params, 'description')
      ? String(params.description || '').trim()
      : String(edge.description || '');

    const changed =
      (edge.pathStyle || 'straight') !== pathStyle ||
      (edge.strokeStyle || 'solid') !== strokeStyle ||
      Boolean(edge.arrowFrom) !== arrowFrom ||
      Boolean(edge.arrowTo) !== arrowTo ||
      (edge.description || '') !== description;

    if (!changed) return;
    pushHistory();

    edge.pathStyle = pathStyle;
    edge.strokeStyle = strokeStyle;
    edge.arrowFrom = arrowFrom;
    edge.arrowTo = arrowTo;
    edge.description = description;

    const nodeA = nodes.find((n) => n.id === edge.from);
    const nodeB = nodes.find((n) => n.id === edge.to);
    if (nodeA) nodeA.dirty = true;
    if (nodeB) nodeB.dirty = true;

    updateTopbar();
    renderRightPanel();
    render();
    setStatus(t('inspector.status.edgeAutosaved', { id: edge.id }));
    return { updated: true, edgeId: edge.id };
  }

  function addResourceBindingFromInspector() {
    const selected = getSelectedNode();
    if (!selected) return;

    const selectedLayerContent = getNodeLayerContent(selected);
    if (!Array.isArray(selectedLayerContent.resourceBindings)) {
      selectedLayerContent.resourceBindings = [];
    }

    pushHistory();
    selectedLayerContent.resourceBindings.push({ path: '', description: '' });
    selected.dirty = true;
    selected.revision += 1;
    fieldExpectedRevision.value = String(selected.revision);

    setStatus(t('inspector.status.bindingAdded', { name: selected.name }));
    updateTopbar();
    rebuildSidebar();
    renderRightPanel();
    render();

    // Focus the path field of the freshly inserted binding for immediate editing.
    const items = blockBinding.querySelectorAll('li.binding-item');
    const lastItem = items[items.length - 1];
    const firstInput = lastItem ? lastItem.querySelector('.binding-path-input') : null;
    if (firstInput) firstInput.focus();
  }

  function commitResourceBindingEdit(index, field, rawValue) {
    const target = getSelectedNode();
    if (!target) return;
    const targetLayerContent = getNodeLayerContent(target);
    const targetBindings = Array.isArray(targetLayerContent.resourceBindings) ? targetLayerContent.resourceBindings : [];
    if (!Number.isInteger(index) || index < 0 || index >= targetBindings.length) return;
    if (field !== 'path' && field !== 'description') return;

    const value = String(rawValue || '').trim();
    if ((targetBindings[index][field] || '') === value) return;

    pushHistory();
    targetBindings[index] = { ...targetBindings[index], [field]: value };
    targetLayerContent.resourceBindings = targetBindings;
    target.dirty = true;
    target.revision += 1;
    fieldExpectedRevision.value = String(target.revision);
    setStatus(t('inspector.status.nodeAutosaved', { name: target.name }));
    updateTopbar();
    rebuildSidebar();
    render();
  }

  function applySelectedNodeChanges() {
    const selected = getSelectedNode();
    if (!selected) return;

    const expectedRevision = Number(fieldExpectedRevision.value);
    if (expectedRevision !== selected.revision) {
      setEditorLocked(true, t('inspector.lock.expectedRevisionMismatch'));
      setStatus(t('inspector.status.saveBlockedExpectedRevisionMismatch'));
      return;
    }

    if (hasConflict(selected.id)) {
      setEditorLocked(true, t('inspector.lock.conflict'));
      setStatus(t('inspector.status.saveBlockedConflict'));
      return;
    }

    const mirrorNode = isMirrorNode(selected);
    const src = mirrorNode ? nodes.find((n) => n.id === selected.mirrorOfId) : null;
    const currentLayerData = getNodeLayerContent(selected);
    const srcLayerData = src ? getNodeLayerContent(src) : null;

    const nextName = mirrorNode ? (src?.name || selected.name) : (fieldName.value.trim() || selected.name);
    const nextSynopsis = mirrorNode ? (srcLayerData?.synopsis || srcLayerData?.summary || '') : fieldSummary.value.trim();
    const nextDetail = fieldDetail.value.trim();
    const nextStatus = fieldStatus ? fieldStatus.value : (currentLayerData.status || 'active');
    const nextColorIndex = mirrorNode
      ? normalizeColorIndex(src?.colorIndex)
      : normalizeColorIndex(fieldColorIndex ? fieldColorIndex.value : selected.colorIndex);

    const duplicateNameBlocked = mirrorNode
      ? !isNodeNameAvailable(nextName, selected.id) && !(src && String(src.name || '') === nextName)
      : !isNodeNameAvailable(nextName, selected.id);

    if (duplicateNameBlocked) {
      setStatus(t('inspector.status.saveBlockedDuplicateNodeName', { name: nextName }));
      fieldName.value = selected.name;
      return;
    }

    const changed =
      selected.name !== nextName ||
      (currentLayerData.synopsis || '') !== nextSynopsis ||
      (currentLayerData.detail || '') !== nextDetail ||
      (currentLayerData.status || '') !== nextStatus ||
      normalizeColorIndex(selected.colorIndex) !== nextColorIndex;

    if (!changed) return;
    pushHistory();

    selected.name = nextName;
    currentLayerData.synopsis = nextSynopsis;
    currentLayerData.detail = nextDetail;
    currentLayerData.status = nextStatus;
    selected.synopsis = currentLayerData.synopsis;
    selected.detail = currentLayerData.detail;
    selected.status = currentLayerData.status;
    selected.colorIndex = nextColorIndex;
    selected.dirty = true;
    selected.revision += 1;
    selected.audit.unshift({ actor: 'user', time: '2026-03-19 04:26', tool: 'right-sidebar-save', target: `node:${selected.id}` });

    fieldExpectedRevision.value = String(selected.revision);
    setStatus(t('inspector.status.nodeAutosaved', { name: selected.name }));
    updateTopbar();
    rebuildSidebar();
    renderRightPanel();
    render();
  }

  return {
    renderRightPanel,
    setEditorLocked,
    applyEdgeEditorChanges,
    updateEdgeByParams,
    addResourceBindingFromInspector,
    applySelectedNodeChanges,
  };
}
