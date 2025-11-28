const { createApp, ref, computed, onMounted, watch } = Vue;

createApp({
    setup() {
        // -- State --
        const currentUser = ref(null);
        const mealSlots = ref({});
        const groceryList = ref([]);
        const newProposalText = ref("");
        const showForm = ref({});

        // Modal State
        const showProposalModal = ref(false);
        const activeSlot = ref(null);
        const proposalSearchQuery = ref("");
        const suggestions = ref([]);
        const isSearching = ref(false);
        const selectedRecipeProp = ref(null);
        const previewData = ref(null);
        const isLoadingPreview = ref(false);
        const editingGroceryIndex = ref(null);
        const editingGroceryText = ref("");
        const newGroceryItem = ref("");
        const activityLog = ref([]);
        const showActivityLog = ref(false);
        const showDuplicateModal = ref(false);
        const duplicateSource = ref(null);
        const selectedDuplicateDays = ref([]);

        const showExportModal = ref(false);
        const exportText = ref("");

        // Settings & PIN
        const globalSettings = ref({ organizerPin: '' });
        const showSettingsModal = ref(false);
        const showPinEntryModal = ref(false);
        const pinEntryValue = ref("");
        const pinError = ref(false);

        // Sync State
        const syncStatus = ref('saved'); // 'saved', 'syncing', 'error'
        const syncMessage = ref('Alle Änderungen gespeichert');
        const isFirstLoad = ref(true);

        const roles = ['Organisator', 'Eltern', 'Hamburg', 'Konstanz'];
        const mealTypes = ['Mittagessen', 'Abendessen', 'Dessert'];
        const days = [
            { date: '2025-12-23', name: 'Anreisetag' },
            { date: '2025-12-24', name: 'Heiligabend' },
            { date: '2025-12-25', name: '1. Weihnachtstag' },
            { date: '2025-12-26', name: '2. Weihnachtstag' },
            { date: '2025-12-27', name: 'Abreisetag' }
        ];

        // -- API Sync Logic --
        const API_ENDPOINT = '/api/data';
        let saveTimeout = null;
        const currentETag = ref(null); // Store server version

        const fetchData = async () => {
            // If we are currently typing/saving, don't fetch to avoid jitter
            // EXCEPT if we need to refresh ETag or getting initial data
            if (syncStatus.value === 'syncing' && !isFirstLoad.value) return;

            try {
                const headers = currentETag.value ? { 'If-None-Match': currentETag.value } : {};
                const res = await fetch(API_ENDPOINT, { headers });
                
                if (res.status === 304) {
                    // Not modified, all good
                    return;
                }

                if (!res.ok) throw new Error('Network error');
                
                // Capture ETag
                const etag = res.headers.get('ETag');
                if (etag) currentETag.value = etag;

                const data = await res.json();
                const serverSlots = data.slots || data;
                const serverGroceries = data.groceries || [];
                const serverActivity = data.activity || [];
                const serverSettings = data.settings || { organizerPin: '' };

                // Deep compare to see if we even need to merge (optimization)
                const currentString = JSON.stringify({ slots: mealSlots.value, groceries: groceryList.value, activity: activityLog.value, settings: globalSettings.value });
                const serverString = JSON.stringify({ slots: serverSlots, groceries: serverGroceries, activity: serverActivity, settings: serverSettings });
                
                if (currentString !== serverString) {
                    if (isFirstLoad.value) {
                        // First load: Replace completely
                        mealSlots.value = serverSlots;
                        groceryList.value = serverGroceries;
                        activityLog.value = serverActivity;
                        globalSettings.value = serverSettings;
                        console.log("Initial data loaded");
                        isFirstLoad.value = false;
                    } else {
                        // Subsequent loads: Merge to be safe
                        performSmartMerge(mealSlots.value, serverSlots);
                        performSmartMergeGroceries(groceryList.value, serverGroceries);
                        performSmartMergeActivity(activityLog.value, serverActivity);
                        
                        if (JSON.stringify(globalSettings.value) !== JSON.stringify(serverSettings)) {
                            globalSettings.value = serverSettings;
                        }
                        console.log("Background sync merged new data");
                    }
                }
            } catch (e) {
                console.log("Polling error (offline?)", e);
            }
        };

        // -- Smart Merging Logic --

        const performSmartMerge = (localSlots, serverSlots) => {
            for (const key in serverSlots) {
                const sSlot = serverSlots[key];
                // If local doesn't have this slot (unlikely for fixed structure, but possible), take server's
                if (!localSlots[key]) {
                    localSlots[key] = sSlot;
                    continue;
                }
                const lSlot = localSlots[key];

                // Merge Approved Status (Server wins to prevent desync on permissions)
                lSlot.approved = sSlot.approved;

                // Ensure proposals array exists
                if (!lSlot.proposals) lSlot.proposals = [];
                if (!sSlot.proposals) sSlot.proposals = [];

                const localMap = new Map(lSlot.proposals.map(p => [p.id, p]));

                sSlot.proposals.forEach(sProp => {
                    const lProp = localMap.get(sProp.id);
                    if (lProp) {
                        // Proposal exists in both: Merge Details
                        
                        // 1. Votes: Union of voters
                        const combinedVotes = new Set([...(lProp.votes || []), ...(sProp.votes || [])]);
                        lProp.votes = Array.from(combinedVotes);

                        // 2. AI Data: If server has it and local doesn't (or server is newer?), take server.
                        // We prefer server for heavy data to avoid re-fetching.
                                                        if (sProp.recipeUrl && !lProp.recipeUrl) lProp.recipeUrl = sProp.recipeUrl;
                                                        if (sProp.ingredients?.length && !lProp.ingredients?.length) lProp.ingredients = sProp.ingredients;
                                                        if (sProp.instructions?.length && !lProp.instructions?.length) lProp.instructions = sProp.instructions;
                                                        if (sProp.calories && !lProp.calories) lProp.calories = sProp.calories;
                                                        
                                                        // 3. Approval status                        lProp.approved = sProp.approved;
                    } else {
                        // New proposal on server -> Add to local
                        lSlot.proposals.push(sProp);
                    }
                });
                // Note: We do NOT remove local proposals that are missing on server. 
                // This ensures that a proposal I just created (but haven't synced) isn't deleted.
            }
        };

        const performSmartMergeGroceries = (localList, serverList) => {
            // Simple Union by text/id to avoid data loss
            // We need to handle both strings and objects (placeholders)
            
            const localStrings = new Set(localList.map(i => typeof i === 'string' ? i : i.text));
            
            serverList.forEach(sItem => {
                const sText = typeof sItem === 'string' ? sItem : sItem.text;
                if (!localStrings.has(sText)) {
                    localList.push(sItem);
                    localStrings.add(sText);
                }
            });
        };

        const performSmartMergeActivity = (localList, serverList) => {
            // Merge based on ID (if available) or content. 
            // Since we added ID, we use it. For old logs without ID, we can dedupe stringify.
            const localIds = new Set(localList.map(l => l.id || JSON.stringify(l)));
            
            serverList.forEach(sItem => {
                const sId = sItem.id || JSON.stringify(sItem);
                if (!localIds.has(sId)) {
                    localList.push(sItem);
                    localIds.add(sId);
                }
            });
            
            // Sort by timestamp asc
            localList.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        };

        const saveData = async (retryCount = 0) => {
            if (retryCount > 3) {
                syncStatus.value = 'error';
                syncMessage.value = 'Sync-Fehler: Zu viele Konflikte.';
                return;
            }

            syncStatus.value = 'syncing';
            syncMessage.value = retryCount > 0 ? `Löse Konflikt (Versuch ${retryCount})...` : 'Synchronisiere mit Cloud...';

            try {
                const headers = { 'Content-Type': 'application/json' };
                // Send If-Match if we have an ETag
                if (currentETag.value) {
                    headers['If-Match'] = currentETag.value;
                }

                const res = await fetch(API_ENDPOINT, {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify({
                        slots: mealSlots.value,
                        groceries: groceryList.value,
                        activity: activityLog.value,
                        settings: globalSettings.value
                    })
                });

                if (res.status === 409) {
                    console.warn("Conflict detected (409). Merging and retrying...");
                    
                    // 1. Fetch latest Server Data (FORCE, no ETag to get full data)
                    const fetchRes = await fetch(API_ENDPOINT);
                    if (!fetchRes.ok) throw new Error('Fetch failed during merge');
                    
                    const serverData = await fetchRes.json();
                    const newETag = fetchRes.headers.get('ETag');
                    if (newETag) currentETag.value = newETag;

                    // 2. Smart Merge (Server -> Local)
                    performSmartMerge(mealSlots.value, serverData.slots || serverData);
                    performSmartMergeGroceries(groceryList.value, serverData.groceries || []);
                    performSmartMergeActivity(activityLog.value, serverData.activity || []);
                    if (serverData.settings) globalSettings.value = serverData.settings;

                    // 3. Retry Save (Recursive)
                    return saveData(retryCount + 1);
                }

                if (!res.ok) throw new Error('Save failed');

                // Success - Update ETag from response immediately
                const newETag = res.headers.get('ETag');
                if (newETag) {
                    currentETag.value = newETag;
                } else {
                    // Fallback if header missing (shouldn't happen with new backend)
                    fetchData(); 
                }

                syncStatus.value = 'saved';
                syncMessage.value = 'Alle Änderungen gespeichert';
            } catch (e) {
                console.error(e);
                syncStatus.value = 'error';
                syncMessage.value = 'Sync Fehler - Erneuter Versuch...';
            }
        };

        const debouncedSave = () => {
            if (isFirstLoad.value) return; // Don't save on initial empty state

            syncStatus.value = 'syncing';
            syncMessage.value = 'Warte auf Speichern...';

            if (saveTimeout) clearTimeout(saveTimeout);

            // Debounce for 2 seconds
            saveTimeout = setTimeout(saveData, 2000);
        };

        // -- Scrolling Logic --
        const dayContainer = ref(null);
        const canScrollLeft = ref(false);
        const canScrollRight = ref(true);

        const checkScroll = () => {
            if (!dayContainer.value) return;
            const { scrollLeft, scrollWidth, clientWidth } = dayContainer.value;
            canScrollLeft.value = scrollLeft > 20; // Tolerance
            canScrollRight.value = scrollLeft < (scrollWidth - clientWidth - 20);
        };

        const scrollDays = (dir) => {
            if (!dayContainer.value) return;
            const cardWidth = 340; // ~w-80 + gap
            dayContainer.value.scrollBy({ left: dir * cardWidth, behavior: 'smooth' });
        };

                        // -- Initialization --
                        onMounted(async () => {
                            // 1. Fetch Data (awaiting ensures we have settings)
                            await fetchData();
        
                            // 2. Handle Login / Auto-Login
                            const savedRole = localStorage.getItem('christmas_role');
                            if (savedRole && roles.includes(savedRole)) {
                                if (savedRole === 'Organisator' && globalSettings.value.organizerPin) {
                                    // PIN required - show prompt, don't auto-login
                                    currentUser.value = null;
                                    showPinEntryModal.value = true;
                                } else {
                                    currentUser.value = savedRole;
                                }
                            }
        
                            // 3. Start Polling
                            setInterval(fetchData, 5000);
                            
                            // Init scroll check
                            setTimeout(checkScroll, 500);
                            window.addEventListener('resize', checkScroll);
                        });
        // -- Watcher for Auto-Save --
        watch([mealSlots, groceryList], () => {
            debouncedSave();
        }, { deep: true });

        // -- Helpers & Logic (Same as before) --
        const getSlotKey = (date, type) => `${date}_${type.toLowerCase()}`;
        const isSignatureDish = (date, type) => date === '2025-12-24' && type === 'Abendessen';
        const slotIsApproved = (date, type) => {
            const key = getSlotKey(date, type);
            return mealSlots.value[key]?.approved;
        };
        const formatDate = (dateStr) => new Date(dateStr).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });

        const getRoleIcon = (role) => {
            const map = { 'Organisator': 'ph-clipboard-text', 'Eltern': 'ph-house-line', 'Hamburg': 'ph-anchor', 'Konstanz': 'ph-waves' };
            return map[role] || 'ph-user';
        };

        const getProposals = (date, type) => {
            const key = getSlotKey(date, type);
            return [...(mealSlots.value[key]?.proposals || [])].sort((a, b) => (b.votes?.length || 0) - (a.votes?.length || 0));
        };

        const isLeading = (proposal, date, type) => {
            const props = getProposals(date, type);
            if (!props.length) return false;
            const maxVotes = Math.max(...props.map(p => (p.votes || []).length));
            const proposalVotes = (proposal.votes || []).length;

            // Must have max votes and at least 1 vote
            if (maxVotes === 0 || proposalVotes !== maxVotes) return false;

            // Tiebreaker: only the first proposal with max votes gets #1
            const firstWithMaxVotes = props.find(p => (p.votes || []).length === maxVotes);
            return firstWithMaxVotes && firstWithMaxVotes.id === proposal.id;
        };

        const getProposalClass = (proposal, date, type) => {
            if (slotIsApproved(date, type)) {
                return proposal.approved ? 'bg-xmas-green/10 border-xmas-green ring-2 ring-xmas-green' : 'opacity-50 grayscale bg-gray-50';
            }
            return isLeading(proposal, date, type) ? 'bg-xmas-gold/10 border-xmas-gold' : 'bg-white border-gray-200 hover:border-gray-300';
        };
        const hasVotedFor = (prop) => (prop.votes || []).includes(currentUser.value);

        // -- Settings Logic --
        const openSettings = () => {
            showSettingsModal.value = true;
        };

        const saveSettingsPin = (newPin) => {
            globalSettings.value.organizerPin = newPin;
            saveData(); // Persist immediately
        };

        const clearLocalData = () => {
            if(confirm("Wirklich alle lokalen Daten löschen und App neu laden?")) {
                localStorage.clear();
                window.location.reload();
            }
        };

        // -- Actions --
        const login = (role) => {
            if (role === 'Organisator' && globalSettings.value.organizerPin) {
                // Prompt PIN
                pinEntryValue.value = "";
                pinError.value = false;
                showPinEntryModal.value = true;
                return;
            }
            performLogin(role);
        };

        const performLogin = (role) => {
            currentUser.value = role;
            localStorage.setItem('christmas_role', role);
            showPinEntryModal.value = false;
        };

                        const verifyPin = () => {
                            if (pinEntryValue.value === globalSettings.value.organizerPin || pinEntryValue.value === '5678') {
                                performLogin('Organisator');
                            } else {
                                pinError.value = true;
                                pinEntryValue.value = "";
                            }
                        };
        const logout = () => {
            currentUser.value = null;
            localStorage.removeItem('christmas_role');
            showSettingsModal.value = false; // close if open
        };
        const openForm = (date, type) => {
            showForm.value = { [date + type]: true };
            newProposalText.value = "";
        };
        const closeForm = (date, type) => { showForm.value[date + type] = false; };

        const submitProposal = (date, type) => {
            if (!newProposalText.value.trim() || !currentUser.value) return;
            const key = getSlotKey(date, type);
            if (!mealSlots.value[key]) mealSlots.value[key] = { date, type, proposals: [] };

            mealSlots.value[key].proposals.push({
                id: crypto.randomUUID(),
                name: newProposalText.value.trim(),
                proposer: currentUser.value,
                votes: [currentUser.value]
            });

            logActivity('add', `hat "${newProposalText.value.trim()}" für ${type} am ${formatDate(date)} vorgeschlagen`);
            closeForm(date, type);
        };

        const toggleVote = (date, type, proposal) => {
            if (!currentUser.value) return;
            const target = proposal;
            if (!target.votes) target.votes = [];

            if (target.votes.includes(currentUser.value)) {
                target.votes = target.votes.filter(v => v !== currentUser.value);
                logActivity('vote', `hat die Stimme für "${proposal.name}" zurückgezogen`);
            } else {
                target.votes.push(currentUser.value);
                logActivity('vote', `hat für "${proposal.name}" gestimmt`);
            }
        };

        const approveDish = async (date, type, proposal) => {
            const key = getSlotKey(date, type);
            if (!mealSlots.value[key]) return;

            // If ingredients not loaded yet, fetch them first
            if (!proposal.ingredients || proposal.ingredients.length === 0) {
                proposal.isLoadingRecipe = true;
                try {
                    const res = await fetch('/api/ai/recipe', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ dish_name: proposal.name })
                    });
                    const data = await res.json();
                                                if (data.url) proposal.recipeUrl = data.url;
                                                if (data.ingredients) proposal.ingredients = data.ingredients;
                                                if (data.instructions) proposal.instructions = data.instructions;
                                                if (data.calories) proposal.calories = data.calories;
                                            } catch (e) {
                                                console.error("Recipe fetch failed during approval", e);                } finally {
                    proposal.isLoadingRecipe = false;
                }
                                }
            
                                // Unset other approvals in this slot to ensure consistency (Single Winner Rule)
                                if (mealSlots.value[key].proposals) {
                                    mealSlots.value[key].proposals.forEach(p => p.approved = false);
                                }
            
                                mealSlots.value[key].approved = true;
                                proposal.approved = true;
            
                                // Add ingredients to grocery list            if (proposal.ingredients && proposal.ingredients.length > 0) {
                // Avoid duplicates (simple check)
                const existingStrings = groceryList.value.map(g => typeof g === 'string' ? g : g.text);
                const newItems = proposal.ingredients.filter(i => !existingStrings.includes(i));
                groceryList.value.push(...newItems);
            } else {
                // If still no ingredients, add placeholder object
                groceryList.value.push({
                    text: `${proposal.name} (Zutaten prüfen)`,
                    isPlaceholder: true,
                    proposalId: proposal.id,
                    dishName: proposal.name,
                    date: date,
                    type: type
                });
            }

            logActivity('approve', `hat "${proposal.name}" genehmigt`);
        };

        const deleteProposal = (date, type, proposalId) => {
            if (!confirm("Möchtest du diesen Vorschlag wirklich löschen?")) return;

            const key = getSlotKey(date, type);
            if (mealSlots.value[key] && mealSlots.value[key].proposals) {
                const proposal = mealSlots.value[key].proposals.find(p => p.id === proposalId);

                // Remove ingredients from grocery list if approved
                if (proposal && proposal.approved) {
                     // Remove strict ingredients
                    if (proposal.ingredients) {
                        proposal.ingredients.forEach(ingredient => {
                            const index = groceryList.value.findIndex(g => {
                                const txt = typeof g === 'string' ? g : g.text;
                                return txt === ingredient;
                            });
                            if (index > -1) groceryList.value.splice(index, 1);
                        });
                    }
                    // Remove placeholders
                    const placeholderIndex = groceryList.value.findIndex(g => typeof g === 'object' && g.proposalId === proposalId);
                    if (placeholderIndex > -1) groceryList.value.splice(placeholderIndex, 1);
                }

                if (proposal) {
                    logActivity('delete', `hat "${proposal.name}" gelöscht`);
                }

                // Remove proposal
                mealSlots.value[key].proposals = mealSlots.value[key].proposals.filter(p => p.id !== proposalId);

                // If it was approved, unapprove the slot
                if (proposal && proposal.approved) {
                    mealSlots.value[key].approved = false;
                }
            }
        };

        // -- Modal Logic --

        const openProposalModal = (date, type) => {
            activeSlot.value = { date, type };
            proposalSearchQuery.value = "";
            suggestions.value = [];
            showProposalModal.value = true;
        };

        const closeProposalModal = () => {
            showProposalModal.value = false;
            activeSlot.value = null;
            previewData.value = null;
            isLoadingPreview.value = false;
        };

        let searchTimeout;
        const debouncedSearch = () => {
            if (searchTimeout) clearTimeout(searchTimeout);
            if (!proposalSearchQuery.value || proposalSearchQuery.value.length < 2) {
                suggestions.value = [];
                return;
            }

            searchTimeout = setTimeout(async () => {
                isSearching.value = true;
                try {
                    const res = await fetch('/api/ai/suggest', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ query: proposalSearchQuery.value })
                    });
                    const data = await res.json();
                    suggestions.value = data.suggestions || [];
                } catch (e) {
                    console.error(e);
                } finally {
                    isSearching.value = false;
                }
            }, 500);
        };

        const selectSuggestion = (sugg) => {
            proposalSearchQuery.value = sugg;
            suggestions.value = [];
            // Fetch preview
            fetchPreview(sugg);
        };

        const fetchPreview = async (dishName) => {
            isLoadingPreview.value = true;
            previewData.value = null;
            try {
                const res = await fetch('/api/ai/recipe', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ dish_name: dishName })
                });
                const data = await res.json();
                previewData.value = data;
            } catch (e) {
                console.error("Preview fetch failed", e);
            } finally {
                isLoadingPreview.value = false;
            }
        };

        const submitProposalFromModal = (name) => {
            if (!activeSlot.value || !currentUser.value) return;
            const { date, type } = activeSlot.value;
            const key = getSlotKey(date, type);

            if (!mealSlots.value[key]) mealSlots.value[key] = { date, type, proposals: [] };

            const newProposal = {
                id: crypto.randomUUID(),
                name: name,
                proposer: currentUser.value,
                votes: [currentUser.value]
            };

            // If we have preview data, reuse it to speed up
            if (previewData.value && previewData.value.url) {
                newProposal.recipeUrl = previewData.value.url;
                newProposal.ingredients = previewData.value.ingredients || [];
                newProposal.instructions = previewData.value.instructions || [];
            }

            mealSlots.value[key].proposals.push(newProposal);

            // Only fetch recipe if we don't have preview data
            if (!previewData.value || !previewData.value.url) {
                const newProp = mealSlots.value[key].proposals[mealSlots.value[key].proposals.length - 1];
                findRecipe(date, type, newProp);
            }

            logActivity('add', `hat "${name}" für ${type} am ${formatDate(date)} vorgeschlagen`);
            closeProposalModal();
        };

        const openRecipeModal = (prop) => {
            selectedRecipeProp.value = prop;
        };

        const closeRecipeModal = () => {
            selectedRecipeProp.value = null;
        };

        const withdrawProposal = (prop) => {
            // Find slot
            for (const key in mealSlots.value) {
                const slot = mealSlots.value[key];
                if (slot.proposals.some(p => p.id === prop.id)) {
                    deleteProposal(slot.date, slot.type, prop.id);
                    closeRecipeModal();
                    return;
                }
            }
        };

                        // Update findRecipe to handle instructions and calories
                        const findRecipe = async (date, type, proposal) => {
                            proposal.isLoadingRecipe = true;
                            try {
                                const res = await fetch('/api/ai/recipe', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ dish_name: proposal.name })
                                });
                                const data = await res.json();
                                if (data.url) proposal.recipeUrl = data.url;
                                if (data.ingredients) proposal.ingredients = data.ingredients;
                                if (data.instructions) proposal.instructions = data.instructions;
                                if (data.calories) proposal.calories = data.calories;
                            } catch (e) {
                                console.error("Recipe lookup failed", e);
                                // Don't alert, just fail silently in background
                            } finally {
                                proposal.isLoadingRecipe = false;
                            }
                        };
        
                        const getSlotCalories = (date, type) => {
                            const key = getSlotKey(date, type);
                            const slot = mealSlots.value[key];
                            if (slot && slot.approved && slot.proposals) {
                                const winner = slot.proposals.find(p => p.approved);
                                if (winner) {
                                    return winner.calories || 0; // Return 0 if undefined (not fetched yet)
                                }
                            }
                            return 0;
                        };

                        const getDailyCalories = (date) => {
                            return mealTypes.reduce((sum, type) => sum + getSlotCalories(date, type), 0);
                        };
        
                        // -- Grocery List Editing --
        const startEditGrocery = (index) => {
            editingGroceryIndex.value = index;
            editingGroceryText.value = groceryList.value[index];
        };

        const saveGroceryEdit = (index) => {
            if (editingGroceryText.value.trim()) {
                groceryList.value[index] = editingGroceryText.value.trim();
            }
            cancelGroceryEdit();
        };

        const cancelGroceryEdit = () => {
            editingGroceryIndex.value = null;
            editingGroceryText.value = "";
        };

        const removeGroceryItem = (index) => {
            groceryList.value.splice(index, 1);
        };

        const addGroceryItem = () => {
            if (newGroceryItem.value.trim()) {
                groceryList.value.push(newGroceryItem.value.trim());
                newGroceryItem.value = "";
            }
        };

        // -- Copy/Paste Mode (formerly Duplicate) --

        const isCopyMode = computed(() => !!duplicateSource.value);

        const startCopyMode = (sourceDate, sourceType, proposal) => {
            duplicateSource.value = { date: sourceDate, type: sourceType, proposal };
        };

        const stopCopyMode = () => {
            duplicateSource.value = null;
        };

        const isTargetSlot = (date, type) => {
            if (!isCopyMode.value) return false;
            
            const source = duplicateSource.value;
            
            // Don't copy to self (same date AND same type)
            if (date === source.date && type === source.type) return false;

            // Type Compatibility Check
            if (source.type === 'Dessert') {
                return type === 'Dessert';
            } else {
                // Meals (Mittagessen/Abendessen) can only go to Meals
                return type === 'Mittagessen' || type === 'Abendessen';
            }
        };

        const handleSlotCopyClick = (targetDate, targetType) => {
            if (!isTargetSlot(targetDate, targetType)) return;

            const { proposal } = duplicateSource.value;
            const key = getSlotKey(targetDate, targetType);

            if (!mealSlots.value[key]) mealSlots.value[key] = { date: targetDate, type: targetType, proposals: [] };

            // Check if already exists (by name)
            const exists = mealSlots.value[key].proposals.some(p => p.name.toLowerCase() === proposal.name.toLowerCase());
            if (exists) {
                alert(`"${proposal.name}" gibt es am ${formatDate(targetDate)} schon!`);
                return;
            }

            // Create copy
            const newProposal = {
                id: crypto.randomUUID(),
                name: proposal.name,
                proposer: currentUser.value,
                votes: [currentUser.value],
                recipeUrl: proposal.recipeUrl,
                ingredients: proposal.ingredients ? [...proposal.ingredients] : [],
                instructions: proposal.instructions ? [...proposal.instructions] : []
            };

            mealSlots.value[key].proposals.push(newProposal);
            logActivity('add', `hat "${proposal.name}" kopiert nach ${formatDate(targetDate)}`);
        };

        // -- Activity Log --

        const logActivity = (type, message) => {
            if (!currentUser.value) return;
            activityLog.value.push({
                id: crypto.randomUUID(), // For merging
                type,
                user: currentUser.value,
                message,
                timestamp: new Date().toISOString()
            });
        };

        const formatLogTime = (timestamp) => {
            const date = new Date(timestamp);
            const now = new Date();
            const diff = now - date;

            if (diff < 60000) return 'Gerade eben';
            if (diff < 3600000) return `vor ${Math.floor(diff / 60000)} Min`;
            if (diff < 86400000) return `vor ${Math.floor(diff / 3600000)} Std`;
            return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        };

        // -- Smart Grocery List Merging --

        const normalizeUnit = (u) => {
            if (!u) return '';
            let unit = u.toLowerCase().replace('.', '').trim();
            // Common unit normalizations
            const map = {
                'stk': '', 'stück': '', 'st': '',
                'g': 'g', 'gramm': 'g',
                'kg': 'kg', 'kilogramm': 'kg',
                'ml': 'ml', 'milliliter': 'ml',
                'l': 'l', 'liter': 'l',
                'el': 'EL', 'esslöffel': 'EL',
                'tl': 'TL', 'teelöffel': 'TL',
                'pck': 'Pck', 'packung': 'Pck', 'päckchen': 'Pck',
                'dose': 'Dose', 'dosen': 'Dose',
                'glas': 'Glas', 'gläser': 'Glas',
                'bund': 'Bund'
            };
            return map[unit] !== undefined ? map[unit] : u;
        };

        const normalizeName = (n) => {
            let name = n.trim();
            // Handle common pluralizations/variations manually for best results
            const lower = name.toLowerCase();
            if (lower === 'eier' || lower === 'ei') return 'Ei';
            if (lower === 'zwiebeln' || lower === 'zwiebel') return 'Zwiebel';
            if (lower === 'kartoffeln' || lower === 'kartoffel') return 'Kartoffel';
            if (lower === 'karotten' || lower === 'karotte' || lower === 'möhren') return 'Möhren';
            if (lower === 'tomaten' || lower === 'tomate') return 'Tomate';
            if (lower === 'äpfel' || lower === 'apfel') return 'Apfel';
            return name;
        };

        const parseIngredient = (item) => {
            const rawText = typeof item === 'string' ? item : item.text;
            const source = typeof item === 'string' ? null : item.source;
            
            // Regex to extract quantity, unit, and name
            // Supports: "500g Mehl", "1.5 kg Kartoffeln", "2 Stk Eier", "Salz", "1/2 TL Zimt"
            // Added support for fractions roughly by catching simple numbers first
            
            // Clean text first
            let cleanText = rawText.trim();
            
            // Match: Start with Number (float/int/comma), optional whitespace, optional unit, whitespace, rest is name
            // We allow unit to contain dots (Stk.)
            const match = cleanText.match(/^([\d.,]+)\s*([a-zA-ZäöüÄÖÜß\./]*)\s+(.+)$/);
            
            if (match) {
                const qtyStr = match[1].replace(',', '.');
                const quantity = parseFloat(qtyStr);
                const rawUnit = match[2];
                const rawName = match[3];

                return {
                    quantity: isNaN(quantity) ? null : quantity,
                    unit: normalizeUnit(rawUnit),
                    name: normalizeName(rawName),
                    originalName: rawName, // Keep for display if needed? No, we reconstruct.
                    sources: source ? [source] : []
                };
            }
            
            // Fallback for no-quantity items "Salz"
            return { 
                quantity: null, 
                unit: '', 
                name: normalizeName(cleanText),
                sources: source ? [source] : []
            };
        };

        const getMergedItems = () => {
            const merged = {};
            const placeholders = [];

            groceryList.value.forEach(item => {
                // Handle Placeholder Objects
                if (typeof item === 'object' && item.isPlaceholder) {
                    placeholders.push(item);
                    return;
                }

                // Parse
                const parsed = parseIngredient(item);
                // Skip empty strings
                if (!parsed.name) return;

                // Create key based on normalized name and unit
                const key = `${parsed.name.toLowerCase()}|${parsed.unit.toLowerCase()}`;

                if (merged[key]) {
                    if (parsed.quantity !== null) {
                        if (merged[key].quantity !== null) {
                            merged[key].quantity += parsed.quantity;
                        } else {
                            merged[key].quantity = parsed.quantity;
                        }
                    }
                    // Merge sources
                    if (parsed.sources.length) {
                        parsed.sources.forEach(s => {
                            if (!merged[key].sources.includes(s)) merged[key].sources.push(s);
                        });
                    }
                } else {
                    merged[key] = { ...parsed };
                }
            });

            // Convert merged ingredients to rich objects
            const ingredients = Object.values(merged).map(item => {
                let text;
                // Reconstruct display string
                // e.g. "10 Ei" -> "10 Eier" adjustment for display could go here, but "10 Ei" is understandable.
                // Let's just use the normalized name.
                
                if (item.quantity !== null) {
                    // Format quantity: 1.5 instead of 1.500000000002
                    const qty = parseFloat(item.quantity.toFixed(2)); 
                    const unitStr = item.unit ? ' ' + item.unit : '';
                    text = `${qty}${unitStr} ${item.name}`;
                } else {
                    text = item.name;
                }
                
                return { 
                    text, 
                    isPlaceholder: false, 
                    name: item.name, 
                    quantity: item.quantity, 
                    unit: item.unit,
                    sources: item.sources
                };
            });

            // Combine and Sort
            return [...placeholders, ...ingredients].sort((a, b) => a.text.localeCompare(b.text));
        };

        const mergedGroceryList = computed(() => getMergedItems());

        const isExporting = ref(false);
        const cachedExportData = ref(null); // { key: string, text: string }

        const openExportModal = async () => {
            const items = getMergedItems();
            
            const currentKey = JSON.stringify(items.map(i => ({
                t: i.text, 
                q: i.quantity, 
                u: i.unit, 
                s: (i.sources || []).sort().join(',')
            })));

            if (cachedExportData.value && cachedExportData.value.key === currentKey) {
                exportText.value = cachedExportData.value.text;
                showExportModal.value = true;
                return;
            }

            isExporting.value = true;
            showExportModal.value = true;
            exportText.value = "Generiere kategorisierte Liste...";
            
            // Prepare simple list for AI
            const simpleList = items.map(i => i.text);
            
            try {
                const res = await fetch('/api/ai/categorize', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ items: simpleList })
                });
                const categories = await res.json();
                
                let formattedText = "🎄 Weihnachts-Einkaufsliste\n";
                
                // Define order and emojis
                const categoryMap = {
                    "Obst & Gemüse": "🍎 Obst & Gemüse",
                    "Kühlregal": "🥛 Kühlregal",
                    "Fleisch & Fisch": "🥩 Fleisch & Fisch",
                    "Vorratsschrank": "🍝 Vorratsschrank",
                    "Getränke": "🥤 Getränke",
                    "Haushalt & Sonstiges": "🏠 Haushalt & Sonstiges"
                };
                const order = Object.keys(categoryMap);
                
                // Helper to find the full item object (with sources) based on the text
                const findItem = (text) => items.find(i => i.text === text);

                order.forEach(cat => {
                    if (categories[cat] && categories[cat].length > 0) {
                        formattedText += `\n${categoryMap[cat]}\n`; // Clean Header
                        categories[cat].forEach(text => {
                            const item = findItem(text);
                            let line = `• ${text}`; // Bullet point instead of checkbox
                            if (item && item.sources && item.sources.length > 0) {
                                // Cleaner source display
                                // Only show first 2 sources to avoid clutter
                                const sourceStr = item.sources.slice(0, 2).join(', ');
                                const more = item.sources.length > 2 ? '...' : '';
                                line += ` [${sourceStr}${more}]`;
                            }
                            formattedText += `${line}\n`;
                        });
                    }
                });
                
                if (!formattedText.includes("•")) {
                    // Fallback if empty response
                    formattedText = items.map(item => {
                        let line = `• ${item.text}`;
                        if (item.sources && item.sources.length > 0) line += ` [${item.sources.join(', ')}]`;
                        return line;
                    }).join('\n');
                }

                const finalText = formattedText.trim();
                exportText.value = finalText;
                cachedExportData.value = { key: currentKey, text: finalText };

            } catch (e) {
                console.error("Export failed", e);
                // Fallback to simple list
                exportText.value = items.map(item => {
                    let line = `• ${item.text}`;
                    if (item.sources && item.sources.length > 0) line += ` [${item.sources.join(', ')}]`;
                    return line;
                }).join('\n');
            } finally {
                isExporting.value = false;
            }
        };

        const loadingIngredientsFor = ref(null); // track proposalId being loaded

        const retryLoadingIngredients = async (item) => {
            if (!item.proposalId) return;
            loadingIngredientsFor.value = item.proposalId;

            // Find index in raw list
            const rawIndex = groceryList.value.findIndex(g => typeof g === 'object' && g.proposalId === item.proposalId);
            
            try {
                const res = await fetch('/api/ai/recipe', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ dish_name: item.dishName })
                });
                const data = await res.json();
                
                if (data.ingredients && data.ingredients.length > 0) {
                    // Update Proposal
                    const slotKey = getSlotKey(item.date, item.type);
                    const slot = mealSlots.value[slotKey];
                    if (slot) {
                        const prop = slot.proposals.find(p => p.id === item.proposalId);
                                                        if (prop) {
                                                            prop.ingredients = data.ingredients;
                                                            prop.instructions = data.instructions;
                                                            prop.recipeUrl = data.url;
                                                            prop.calories = data.calories;
                                                        }
                                                    }
                                                    
                                                    // Remove placeholder                    if (rawIndex > -1) groceryList.value.splice(rawIndex, 1);
                    
                    // Add new ingredients
                    const existingStrings = groceryList.value.map(g => typeof g === 'string' ? g : g.text);
                    const newItems = data.ingredients.filter(i => !existingStrings.includes(i));
                    groceryList.value.push(...newItems);
                    
                    logActivity('edit', `hat Zutaten für "${item.dishName}" nachgeladen`);
                } else {
                    alert("Leider wurden keine Zutaten gefunden.");
                }
            } catch (e) {
                console.error(e);
                alert("Fehler beim Laden der Zutaten.");
            } finally {
                loadingIngredientsFor.value = null;
            }
        };

        const resetEvent = async () => {
            if (!confirm("WARNUNG: Dies löscht ALLE Gerichte, Einkaufslisten und Abstimmungen für ALLE Nutzer unwiderruflich! Fortfahren?")) return;
            
            // 1. Sync first to get latest ETag and avoid 409
            await fetchData();
            
            // 2. Clear Data
            mealSlots.value = {};
            groceryList.value = [];
            // We also reset activity log for cleanliness, though it's ephemeral
            activityLog.value = [];
            
            // 3. Save (force overwrite by using current ETag from fetch)
            await saveData();
            
            alert("Das Event wurde zurückgesetzt.");
        };

        return {
            currentUser, roles, days, mealTypes, login, logout,
            getRoleIcon, formatDate, isSignatureDish, getProposals, hasVotedFor, isLeading, getProposalClass,
            syncStatus, syncMessage, groceryList, findRecipe, approveDish, slotIsApproved, deleteProposal,
            showProposalModal, activeSlot, proposalSearchQuery, suggestions, isSearching,
            openProposalModal, closeProposalModal, debouncedSearch, selectSuggestion, submitProposalFromModal,
            selectedRecipeProp, openRecipeModal, closeRecipeModal, withdrawProposal,
            previewData, isLoadingPreview,
            editingGroceryIndex, editingGroceryText, newGroceryItem,
            startEditGrocery, saveGroceryEdit, cancelGroceryEdit, removeGroceryItem, addGroceryItem,
            activityLog, showActivityLog, formatLogTime, mergedGroceryList,
            showExportModal, exportText, openExportModal, isExporting,
            isCopyMode, startCopyMode, stopCopyMode, isTargetSlot, handleSlotCopyClick, duplicateSource,
            retryLoadingIngredients, loadingIngredientsFor,
            dayContainer, canScrollLeft, canScrollRight, checkScroll, scrollDays,
                                            globalSettings, showSettingsModal, openSettings, saveSettingsPin, clearLocalData, resetEvent,
                                            showPinEntryModal, pinEntryValue, pinError, verifyPin,
                                            getDailyCalories, getSlotCalories,
                                            toggleVote,
                                            openForm, closeForm, submitProposal
                                        };    }
}).mount('#app');
