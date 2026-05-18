// Client-side friendly greeting/help matcher for the FloatingChatbot.
// Runs BEFORE the API call so common conversational input ("hello",
// "hi there", "help", "what can you do") gets an instant friendly reply
// instead of the brittle 22-pattern command table on the server returning
// `valid:false`.
//
// Returns the reply string when the input matches a greeting/help phrase,
// or `null` when the input is not a recognised greeting and should fall
// through to the API command validator.

var GREETING_REPLIES = [
  // --- Plain greetings ---
  {
    patterns: ['hello', 'hi', 'hey', 'hey there', 'hi there', 'hello there', 'yo', 'sup'],
    reply: 'Hi! I can change channels, filter content, swap themes, and switch profiles. Try "show movies", "mom mode", or tap a suggestion chip below.',
  },
  // --- Time-of-day greetings ---
  {
    patterns: ['good morning', 'morning'],
    reply: 'Good morning! Ready when you are. Try "show movies" or "show live" to get started.',
  },
  {
    patterns: ['good evening', 'evening', 'good night'],
    reply: 'Good evening! Try "show movies", "dark theme", or "mom mode" — or tap a chip below.',
  },
  // --- Help / capability questions ---
  {
    patterns: [
      'help', 'help me', 'what can you do', 'what can you do?',
      'what do you do', 'what do you do?', 'what commands', 'commands',
      'how do i use this', 'how does this work', 'who are you', 'what are you',
    ],
    reply: 'I respond to short commands like "show movies", "show 4K", "mom mode", "dark theme", and "reset filters". Tap the ? icon above for the full list, or use the Suggestions below.',
  },
  // --- Thanks / acknowledgements ---
  {
    patterns: ['thanks', 'thank you', 'thx', 'ty'],
    reply: 'You\'re welcome!',
  },
  // --- Affirmations ---
  {
    patterns: ['ok', 'okay', 'k', 'cool', 'nice'],
    reply: 'Anything else? Try a Suggestion chip below or ask for "help".',
  },
];

function normalise(text) {
  if (typeof text !== 'string') return '';
  // strip punctuation that commonly hangs off chat input ("hi!", "hello?")
  return text.trim().toLowerCase().replace(/[!?.,]+$/g, '');
}

/**
 * Try to match a greeting/help phrase client-side.
 * @param {string} text — raw chatbot input.
 * @returns {string|null} — friendly reply string, or null if no match.
 */
function matchGreeting(text) {
  var n = normalise(text);
  if (!n) return null;
  for (var i = 0; i < GREETING_REPLIES.length; i++) {
    var entry = GREETING_REPLIES[i];
    for (var j = 0; j < entry.patterns.length; j++) {
      if (n === entry.patterns[j]) {
        return entry.reply;
      }
    }
  }
  return null;
}

export { matchGreeting };
