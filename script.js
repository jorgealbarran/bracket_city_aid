// Wait for the DOM to be fully loaded before running the script
document.addEventListener('DOMContentLoaded', () => {
    // Get references to the major UI elements
    const gameContainer = document.getElementById('game-container');
    const undoButton = document.getElementById('undo-button');
    const goButton = document.getElementById('go-button');

    // --- State Management ---
    let history = []; // Stores past states for the undo functionality
    let gameState = null; // The current state of the game, represented as a tree
    let clickTimer = null; // Timer to differentiate between single and double clicks

    // --- Event Listeners ---
    goButton.addEventListener('click', () => {
        // Disable the button to prevent multiple clicks while processing
        goButton.disabled = true;
        goButton.textContent = 'Loading...';

        // Send a message to the background script to get the HTML content
        chrome.runtime.sendMessage({ action: 'getText' }, (response) => {
            // Re-enable the button once the response is received
            goButton.disabled = false;
            goButton.textContent = 'Go!';

            if (response && response.text) {
                const rawHtml = response.text;

                // Create a temporary DOM element to parse the HTML
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = rawHtml;

                // Find all span elements with class 'blank-line' and replace them with three underscores
                const blankLineSpans = tempDiv.querySelectorAll('span.blank-line');
                blankLineSpans.forEach(span => {
                    const underscoreNode = document.createTextNode(' ___ '); // Changed to three underscores
                    span.parentNode.replaceChild(underscoreNode, span);
                });

                // Get the cleaned text from the parsed HTML
                let cleanedHtmlText = tempDiv.innerText;

                // Trim extra text that appears after the puzzle content
                const trimStartIndex = cleanedHtmlText.indexOf(' [enter]');
                if (trimStartIndex !== -1) {
                    cleanedHtmlText = cleanedHtmlText.substring(0, trimStartIndex);
                }

                // Find the start of the puzzle text (after the date and arrow)
                const startIndex = cleanedHtmlText.indexOf('→');
                let puzzleText = startIndex !== -1 ? cleanedHtmlText.substring(startIndex + 1) : cleanedHtmlText;

                // Replace special dash characters (like em-dashes) with a space, but keep underscores
                const finalCleanedText = puzzleText.replace(/[\u2014\u2013\u2015]/g, ' ');

                gameState = parseText(finalCleanedText.trim()); // Parse the cleaned and trimmed text
                history = []; // Reset history
                updateStateAndRender(gameState);

                // Hide the Go button and show the game container
                goButton.style.display = 'none';
                gameContainer.style.display = 'block';
                undoButton.style.display = 'block';
            } else if (response && response.error) {
                // If there was an error, display it to the user
                alert(`Error: ${response.error}`);
            } else {
                // Handle unexpected situations
                alert('Failed to get text from the page. Please make sure you are on the Bracket City game page.');
            }
        });
    });


    // Undo the last action
    undoButton.addEventListener('click', () => {
        if (history.length > 1) {
            history.pop(); // Remove the current state
            const previousState = history[history.length - 1]; // Get the previous state
            // Deep copy the state to prevent mutation issues
            gameState = JSON.parse(JSON.stringify(previousState));
            renderGame(gameState); // Re-render with the old state
        }
    });

    // --- Core Logic ---

    /**
     * Parses a string with brackets into a tree structure.
     * Each bracket pair becomes a 'bracket' node, and text outside becomes a 'text' node.
     * @param {string} text The input text from the textarea.
     * @returns {object} The root node of the generated tree.
     */
    function parseText(text) {
        let idCounter = 0; // Unique ID for each node
        const stack = []; // Stack to manage nested brackets
        const root = { id: idCounter++, type: 'root', children: [] };
        let current = root; // The current node being built
        let lastIndex = 0; // Tracks position in the text

        for (let i = 0; i < text.length; i++) {
            if (text[i] === '[') {
                // Add preceding text if any
                if (i > lastIndex) {
                    current.children.push({ type: 'text', content: text.substring(lastIndex, i) });
                }
                // Create a new bracket node
                const newNode = { id: idCounter++, type: 'bracket', children: [], guessedWord: null, isGuessedWordVisible: false };
                current.children.push(newNode);
                stack.push(current); // Push current parent to stack
                current = newNode; // Descend into the new node
                lastIndex = i + 1;
            } else if (text[i] === ']') {
                // Add text content inside the brackets
                if (i > lastIndex) {
                    current.children.push({ type: 'text', content: text.substring(lastIndex, i) });
                }
                // Ascend back to the parent node
                if (stack.length > 0) {
                    current = stack.pop();
                }
                lastIndex = i + 1;
            }
        }
        // Add any remaining text after the last bracket
        if (lastIndex < text.length) {
            current.children.push({ type: 'text', content: text.substring(lastIndex) });
        }
        return root;
    }

    /**
     * Saves the current state to history and triggers a re-render.
     * @param {object} newState The new state to render.
     */
    function updateStateAndRender(newState) {
        // Deep copy for history to prevent mutations
        history.push(JSON.parse(JSON.stringify(newState)));
        renderGame(newState);
    }

    // --- Rendering ---

    /**
     * Clears the game container and renders the current game state.
     * @param {object} state The current game state tree.
     */
    function renderGame(state) {
        gameContainer.innerHTML = ''; // Clear previous content
        const gameFragment = buildGameFragment(state); // Build the new content
        gameContainer.appendChild(gameFragment);
    }

    /**
     * Recursively builds an HTML fragment from the game state tree.
     * @param {object} node The current node in the state tree.
     * @returns {DocumentFragment} A fragment containing the rendered HTML.
     */
    function buildGameFragment(node) {
        const fragment = document.createDocumentFragment();

        node.children.forEach(child => {
            if (child.type === 'text') {
                fragment.appendChild(document.createTextNode(child.content));
            }
            else if (child.type === 'bracket') {
                const span = document.createElement('span');
                span.dataset.id = child.id; // Store node ID for event handling

                // If a word has been guessed and should be visible
                if (child.guessedWord && child.isGuessedWordVisible) {
                    span.textContent = child.guessedWord;
                    span.classList.add('guessed');
                    // Check the state of descendant nodes to apply styling
                    const { hasBracketChildren, allDescendantsGuessed } = checkDescendantGuessedState(child);
                    if (hasBracketChildren) {
                        if (allDescendantsGuessed) {
                            span.classList.add('all-guessed'); // All sub-brackets are solved
                        } else {
                            span.classList.add('has-unguessed'); // Some sub-brackets are unsolved
                        }
                    } else {
                        span.classList.add('all-guessed'); // No sub-brackets to worry about
                    }
                } else {
                    // Render the original bracketed content (the "clue")
                    span.classList.add('bracket-group');
                    span.appendChild(document.createElement('b')).textContent = '[';
                    const contentSpan = document.createElement('span');
                    contentSpan.classList.add('bracket-content');
                    contentSpan.appendChild(buildGameFragment(child)); // Recurse for nested content
                    span.appendChild(contentSpan);
                    span.appendChild(document.createElement('b')).textContent = ']';
                }
                fragment.appendChild(span);
            }
        });

        return fragment;
    }

    /**
     * Checks if a node has bracket children and if they have all been guessed.
     * @param {object} node The node to check from.
     * @returns {{hasBracketChildren: boolean, allDescendantsGuessed: boolean}}
     */
    function checkDescendantGuessedState(node) {
        let hasBracketChildren = false;
        let allDescendantsGuessed = true;

        function traverse(n) {
            n.children.forEach(c => {
                if (c.type === 'bracket') {
                    hasBracketChildren = true;
                    if (!c.guessedWord) {
                        allDescendantsGuessed = false; // Found an unguessed descendant
                    }
                    traverse(c); // Continue checking deeper
                }
            });
        }

        traverse(node);
        return { hasBracketChildren, allDescendantsGuessed };
    }

    // --- User Interaction ---

    // Highlight bracket content on mouseover for better UX
    gameContainer.addEventListener('mouseover', e => {
        const content = e.target.closest('.bracket-content');
        if (content) content.classList.add('highlight');
    });

    gameContainer.addEventListener('mouseout', e => {
        const content = e.target.closest('.bracket-content');
        if (content) content.classList.remove('highlight');
    });

    // Differentiates between single and double clicks on bracket groups
    gameContainer.addEventListener('click', e => {
        const target = e.target.closest('.bracket-group, .guessed');
        if (!target) return; // Ignore clicks on non-interactive elements

        if (clickTimer) {
            // Double click detected
            clearTimeout(clickTimer);
            clickTimer = null;
            handleDoubleClick(target);
        } else {
            // Set a timer for a single click
            clickTimer = setTimeout(() => {
                clickTimer = null;
                handleSingleClick(target);
            }, 250); // 250ms window for a double click
        }
    });

    /**
     * Handles a single click on a bracket.
     * - If unguessed, it opens an input to guess.
     * - If guessed, it toggles the visibility between the guess and the clue.
     * @param {HTMLElement} target The clicked element.
     */
    function handleSingleClick(target) {
        const id = parseInt(target.dataset.id, 10);
        const node = findNodeById(gameState, id);
        if (node) {
            if (node.guessedWord) {
                // Toggle visibility of the guessed word
                node.isGuessedWordVisible = !node.isGuessedWordVisible;
                updateStateAndRender(gameState);
            } else {
                // Show input to make a new guess
                editNode(node, target, false);
            }
        }
    }

    /**
     * Handles a double click on a bracket.
     * - If guessed, it opens an input to edit the existing guess.
     * @param {HTMLElement} target The clicked element.
     */
    function handleDoubleClick(target) {
        const id = parseInt(target.dataset.id, 10);
        const node = findNodeById(gameState, id);
        if (node && node.guessedWord) {
            // Show input to edit the existing guess
            editNode(node, target, true);
        }
    }

    /**
     * Replaces a bracket span with an input field for guessing or editing.
     * This function creates a temporary input field to allow the user to enter or modify a guess.
     * @param {object} node The state node corresponding to the element.
     * @param {HTMLElement} target The element to replace.
     * @param {boolean} isEditing True if editing an existing guess, false if making a new one.
     */
    function editNode(node, target, isEditing) {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'guess-input';
        if (isEditing) {
            input.value = node.guessedWord;
        }

        target.innerHTML = ''; // Clear the span
        target.appendChild(input);
        input.focus();
        input.select();

        // Saves the guess from the input field
        const handleGuess = () => {
            const value = input.value.trim();
            if (value) {
                node.guessedWord = value;
                node.isGuessedWordVisible = true;
            } else {
                // If the input is cleared, nullify the guess
                node.guessedWord = null;
                node.isGuessedWordVisible = false;
            }
            updateStateAndRender(gameState);
        };

        // Add event listeners to the input field
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter') handleGuess();
            if (e.key === 'Escape') renderGame(gameState); // Cancel editing
        });

        input.addEventListener('blur', handleGuess, { once: true }); // Save on blur
    }

    /**
     * Finds a node in the state tree by its unique ID.
     * @param {object} node The starting node (usually the root).
     * @param {number} id The ID to search for.
     * @returns {object|null} The found node or null.
     */
    function findNodeById(node, id) {
        if (node.id === id) return node;
        if (node.children) {
            for (const child of node.children) {
                const found = findNodeById(child, id);
                if (found) return found;
            }
        }
        return null;
    }
});