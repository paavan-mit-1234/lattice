"""
LATTICE content pipeline.

Single source of truth for the knowledge graph and problem bank. Reference solutions
are executed here to COMPUTE the expected test outputs, so every test is correct by
construction. Emits JSON consumed by the frontend.

  python tools/genbank.py

In the full system this role is played by an LLM-assisted, human-reviewed pipeline.
Here the content is hand-authored. Adding a problem = add one reg(...) call.

Representation choices (keep everything JSON-serializable so the in-browser grader runs
unchanged): trees are nested lists `[val, left, right]` or None; graphs are adjacency
lists (list of sorted neighbor lists); grids are lists of lists. No pointer node classes.
"""

import json
import copy
import os
import traceback
from math import gcd as _gcd

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "src", "data")

# ============================================================ knowledge graph
# (slug, title, category, depth, blurb)
KCS = [
    # Arrays
    ("arrays/indexing", "Array indexing", "Arrays", 0, "Read and write by position; bounds."),
    ("arrays/iterate", "Array iteration", "Arrays", 0, "Single linear pass."),
    ("arrays/prefix-sum", "Prefix sums", "Arrays", 1, "Running aggregates for range queries."),
    ("arrays/in-place", "In-place mutation", "Arrays", 1, "Rearrange without extra space."),
    ("arrays/kadane", "Kadane / running best", "Arrays", 2, "Best running subarray."),
    # Strings
    ("strings/traverse", "String traversal", "Strings", 0, "Scan characters."),
    ("strings/build", "String building", "Strings", 1, "Assemble output efficiently."),
    ("strings/palindrome", "Palindrome logic", "Strings", 1, "Symmetry checks."),
    ("strings/parsing", "Parsing", "Strings", 2, "Tokenize and interpret."),
    # Hashing
    ("hashing/frequency", "Hash frequency", "Hashing", 1, "Count with a dict."),
    ("hashing/lookup", "Hash lookup", "Hashing", 1, "O(1) membership and recall."),
    ("hashing/set-dedup", "Set dedup", "Hashing", 1, "Uniqueness with a set."),
    ("hashing/grouping", "Hash grouping", "Hashing", 2, "Bucket by computed key."),
    # Two pointers
    ("two-pointers/convergent", "Convergent pointers", "Two Pointers", 1, "Close inward."),
    ("two-pointers/partition", "Partitioning", "Two Pointers", 2, "Split by predicate in place."),
    ("two-pointers/fast-slow", "Fast / slow", "Two Pointers", 2, "Two speeds over a sequence."),
    # Sliding window
    ("sliding-window/fixed", "Fixed window", "Sliding Window", 2, "Constant-size window."),
    ("sliding-window/expand", "Window expand", "Sliding Window", 2, "Grow a window."),
    ("sliding-window/shrink", "Window shrink", "Sliding Window", 3, "Contract on constraint."),
    ("sliding-window/distinct", "Distinct window", "Sliding Window", 3, "Track contents with a map."),
    # Binary search
    ("binary-search/boundary", "Binary search boundary", "Binary Search", 2, "Halve with correct edges."),
    ("binary-search/insert", "Search insert", "Binary Search", 2, "Lower bound position."),
    ("binary-search/on-answer", "Binary search on answer", "Binary Search", 3, "Search the value space."),
    ("binary-search/rotated", "Rotated search", "Binary Search", 3, "Pivoted sorted array."),
    # Stack
    ("stack/lifo", "Stack (LIFO)", "Stack", 1, "Push and pop."),
    ("stack/expression", "Expression eval", "Stack", 2, "Evaluate with a stack."),
    ("stack/monotonic", "Monotonic stack", "Stack", 3, "Maintain a sorted stack."),
    # Queue
    ("queue/fifo", "Queue (FIFO)", "Queue", 1, "First in first out."),
    ("queue/monotonic", "Monotonic deque", "Queue", 3, "Sliding extremes."),
    # Linked list (array-modeled)
    ("linked-list/traverse", "List traversal", "Linked List", 1, "Walk a sequence."),
    ("linked-list/two-pointer", "List two-pointer", "Linked List", 2, "Offset pointers."),
    ("linked-list/merge", "Merge lists", "Linked List", 2, "Combine sorted runs."),
    # Trees (nested-list)
    ("trees/dfs", "Tree DFS", "Trees", 2, "Recurse over a tree."),
    ("trees/bfs", "Tree BFS", "Trees", 3, "Level-order traversal."),
    ("trees/bst", "Binary search tree", "Trees", 3, "Ordered tree invariant."),
    ("trees/path", "Tree paths", "Trees", 3, "Reason along root-to-leaf."),
    # Heap
    ("heap/top-k", "Heap top-k", "Heap", 3, "Maintain k extremes."),
    ("heap/k-way", "K-way merge", "Heap", 4, "Merge many sorted runs."),
    # Graph
    ("graph/adjacency", "Adjacency model", "Graphs", 2, "Represent edges."),
    ("graph/bfs", "Graph BFS", "Graphs", 3, "Shortest hops."),
    ("graph/dfs", "Graph DFS", "Graphs", 3, "Explore deeply."),
    ("graph/grid", "Grid search", "Graphs", 3, "Flood fill / matrix BFS."),
    ("graph/union-find", "Union find", "Graphs", 3, "Disjoint sets."),
    ("graph/topo-sort", "Topological sort", "Graphs", 4, "Order a DAG."),
    # Backtracking
    ("backtracking/subsets", "Subsets", "Backtracking", 3, "Enumerate power set."),
    ("backtracking/permute", "Permutations", "Backtracking", 3, "Enumerate orderings."),
    ("backtracking/combine", "Combinations", "Backtracking", 3, "Choose k of n."),
    ("backtracking/constraint", "Constrained search", "Backtracking", 4, "Prune invalid branches."),
    # Greedy
    ("greedy/sorting", "Greedy with sorting", "Greedy", 2, "Sort then sweep."),
    ("greedy/reach", "Reachability greedy", "Greedy", 3, "Track furthest reach."),
    # Intervals
    ("intervals/merge", "Merge intervals", "Intervals", 3, "Coalesce overlaps."),
    ("intervals/schedule", "Interval scheduling", "Intervals", 3, "Count / pick intervals."),
    # DP 1D
    ("dp/1d-linear", "1D DP, linear", "DP 1D", 3, "Build from previous states."),
    ("dp/1d-choice", "1D DP, choices", "DP 1D", 4, "Take or skip."),
    ("dp/subsequence", "Subsequence DP", "DP 1D", 4, "LIS-style."),
    ("dp/partition", "Partition DP", "DP 1D", 4, "Break a sequence."),
    # DP 2D
    ("dp/grid", "Grid DP", "DP 2D", 4, "Paths and costs on a grid."),
    ("dp/two-seq", "Two-sequence DP", "DP 2D", 5, "Align two strings."),
    ("dp/knapsack", "Knapsack DP", "DP 2D", 5, "Bounded selection."),
    # Bit
    ("bit/basics", "Bit basics", "Bit", 1, "Shifts and masks."),
    ("bit/xor", "XOR tricks", "Bit", 2, "Cancellation."),
    ("bit/count", "Bit counting", "Bit", 2, "Population count."),
    # Math
    ("math/gcd", "GCD / number theory", "Math", 1, "Divisibility."),
    ("math/primes", "Primes", "Math", 2, "Sieve and tests."),
    ("math/digits", "Digit manipulation", "Math", 1, "Decompose numbers."),
    ("math/modular", "Modular / counting", "Math", 2, "Mod arithmetic."),
    # Trie
    ("trie/prefix", "Prefix structures", "Trie", 3, "Shared prefixes."),
    # Recursion
    ("recursion/base-case", "Recursion base case", "Recursion", 1, "Terminate."),
    ("recursion/recursive-case", "Recursive case", "Recursion", 2, "Reduce toward base."),
    ("recursion/divide", "Divide and conquer", "Recursion", 3, "Split, solve, combine."),
]

EDGES = [
    ("arrays/iterate", "arrays/prefix-sum"),
    ("arrays/iterate", "arrays/kadane"),
    ("arrays/indexing", "arrays/in-place"),
    ("arrays/iterate", "hashing/frequency"),
    ("arrays/iterate", "hashing/lookup"),
    ("hashing/lookup", "hashing/set-dedup"),
    ("hashing/frequency", "hashing/grouping"),
    ("strings/traverse", "strings/palindrome"),
    ("strings/traverse", "strings/build"),
    ("strings/build", "strings/parsing"),
    ("arrays/indexing", "two-pointers/convergent"),
    ("two-pointers/convergent", "two-pointers/partition"),
    ("two-pointers/convergent", "two-pointers/fast-slow"),
    ("arrays/iterate", "sliding-window/fixed"),
    ("sliding-window/fixed", "sliding-window/expand"),
    ("sliding-window/expand", "sliding-window/shrink"),
    ("hashing/frequency", "sliding-window/distinct"),
    ("sliding-window/shrink", "sliding-window/distinct"),
    ("arrays/indexing", "binary-search/boundary"),
    ("binary-search/boundary", "binary-search/insert"),
    ("binary-search/boundary", "binary-search/on-answer"),
    ("binary-search/boundary", "binary-search/rotated"),
    ("arrays/iterate", "stack/lifo"),
    ("stack/lifo", "stack/expression"),
    ("stack/lifo", "stack/monotonic"),
    ("arrays/iterate", "queue/fifo"),
    ("queue/fifo", "queue/monotonic"),
    ("stack/monotonic", "queue/monotonic"),
    ("arrays/iterate", "linked-list/traverse"),
    ("linked-list/traverse", "linked-list/two-pointer"),
    ("two-pointers/fast-slow", "linked-list/two-pointer"),
    ("linked-list/traverse", "linked-list/merge"),
    ("recursion/recursive-case", "trees/dfs"),
    ("trees/dfs", "trees/bfs"),
    ("queue/fifo", "trees/bfs"),
    ("trees/dfs", "trees/bst"),
    ("binary-search/boundary", "trees/bst"),
    ("trees/dfs", "trees/path"),
    ("hashing/frequency", "heap/top-k"),
    ("heap/top-k", "heap/k-way"),
    ("linked-list/merge", "heap/k-way"),
    ("arrays/iterate", "graph/adjacency"),
    ("graph/adjacency", "graph/bfs"),
    ("graph/adjacency", "graph/dfs"),
    ("queue/fifo", "graph/bfs"),
    ("recursion/recursive-case", "graph/dfs"),
    ("graph/bfs", "graph/grid"),
    ("graph/dfs", "graph/union-find"),
    ("graph/dfs", "graph/topo-sort"),
    ("recursion/recursive-case", "backtracking/subsets"),
    ("backtracking/subsets", "backtracking/permute"),
    ("backtracking/subsets", "backtracking/combine"),
    ("backtracking/combine", "backtracking/constraint"),
    ("graph/dfs", "backtracking/constraint"),
    ("arrays/iterate", "greedy/sorting"),
    ("greedy/sorting", "greedy/reach"),
    ("greedy/sorting", "intervals/merge"),
    ("intervals/merge", "intervals/schedule"),
    ("recursion/recursive-case", "dp/1d-linear"),
    ("dp/1d-linear", "dp/1d-choice"),
    ("dp/1d-linear", "dp/subsequence"),
    ("dp/1d-choice", "dp/partition"),
    ("dp/1d-choice", "dp/knapsack"),
    ("dp/1d-linear", "dp/grid"),
    ("dp/subsequence", "dp/two-seq"),
    ("dp/grid", "dp/two-seq"),
    ("bit/basics", "bit/xor"),
    ("bit/basics", "bit/count"),
    ("math/digits", "math/gcd"),
    ("math/gcd", "math/modular"),
    ("math/primes", "math/modular"),
    ("hashing/lookup", "trie/prefix"),
    ("recursion/recursive-case", "trie/prefix"),
    ("recursion/base-case", "recursion/recursive-case"),
    ("recursion/recursive-case", "recursion/divide"),
    ("binary-search/boundary", "recursion/divide"),
]

# ============================================================ problem bank
PROBS = []


def reg(id, title, category, kcs, diff, fn, starter_body, prompt, ref, inputs, visible=2):
    PROBS.append(
        dict(
            id=id, title=title, category=category, kcs=kcs, difficulty=diff,
            funcName=fn, starter="def %s(%s):\n    %s\n" % (fn, starter_body[0], starter_body[1]),
            prompt=prompt, ref=ref, inputs=inputs, visible=visible,
        )
    )


# ---- helpers for structured inputs ----
def tnode(v, l=None, r=None):
    return [v, l, r]


T1 = tnode(3, tnode(9), tnode(20, tnode(15), tnode(7)))
T2 = tnode(1, tnode(2, tnode(4), tnode(5)), tnode(3))
BST1 = tnode(5, tnode(3, tnode(2), tnode(4)), tnode(7, tnode(6), tnode(8)))
BSTBAD = tnode(5, tnode(3), tnode(7, tnode(4), tnode(8)))

# =================== Arrays ===================
reg("running-sum", "Running sum", "Arrays", [("arrays/prefix-sum", 1.0), ("arrays/iterate", 0.5)], 1,
    "running_sum", ("nums", "pass"),
    "Return the running prefix sums of `nums`: out[i] = nums[0] + ... + nums[i].",
    lambda nums: [s for s in __import__("itertools").accumulate(nums)],
    [([1, 2, 3, 4],), ([1, 1, 1, 1],), ([3, 1, 2, 10, 1],), ([-1, 2, -3, 4],)])

reg("max-subarray", "Maximum subarray", "Arrays", [("arrays/kadane", 1.0)], 2,
    "max_subarray", ("nums", "pass"),
    "Return the largest sum of any contiguous non-empty subarray of `nums` (Kadane).",
    lambda nums: (lambda b, c: [ (c := max(x, c + x), b := max(b, c))[1] for x in nums[1:] ][-1] if len(nums) > 1 else nums[0])(nums[0], nums[0]),
    [([-2, 1, -3, 4, -1, 2, 1, -5, 4],), ([1],), ([5, 4, -1, 7, 8],), ([-3, -1, -2],)])

reg("move-zeroes", "Move zeroes", "Arrays", [("arrays/in-place", 1.0), ("two-pointers/partition", 0.5)], 1,
    "move_zeroes", ("nums", "pass"),
    "Move all zeroes in `nums` to the end while keeping the order of non-zero elements. Return the list.",
    lambda nums: [x for x in nums if x != 0] + [0] * nums.count(0),
    [([0, 1, 0, 3, 12],), ([0, 0, 1],), ([1, 2, 3],), ([0, 0, 0],)])

reg("product-except-self", "Product except self", "Arrays", [("arrays/prefix-sum", 1.0)], 2,
    "product_except_self", ("nums", "pass"),
    "Return an array where out[i] is the product of every element except nums[i]. No division.",
    lambda nums: [__import__("math").prod(nums[:i] + nums[i + 1:]) for i in range(len(nums))],
    [([1, 2, 3, 4],), ([-1, 1, 0, -3, 3],), ([2, 3, 4],), ([5, 5],)])

reg("rotate-array", "Rotate array", "Arrays", [("arrays/in-place", 1.0), ("arrays/indexing", 0.4)], 2,
    "rotate", ("nums, k", "pass"),
    "Rotate `nums` to the right by `k` steps and return it. k may exceed the length.",
    lambda nums, k: (lambda k: nums[-k:] + nums[:-k] if k else nums[:])(k % len(nums) if nums else 0),
    [([1, 2, 3, 4, 5, 6, 7], 3), ([-1, -100, 3, 99], 2), ([1, 2], 3), ([1], 0)])

# =================== Strings ===================
reg("reverse-string", "Reverse string", "Strings", [("two-pointers/convergent", 1.0), ("strings/traverse", 0.4)], 1,
    "reverse_string", ("s", "pass"),
    "Return string `s` reversed. Use two pointers conceptually; do not just call reversed on the whole string trivially.",
    lambda s: s[::-1],
    [("hello",), ("a",), ("",), ("racecar",)])

reg("valid-palindrome", "Valid palindrome", "Strings", [("strings/palindrome", 1.0), ("two-pointers/convergent", 0.5)], 1,
    "is_palindrome", ("s", "pass"),
    "Return True if `s` is a palindrome considering only alphanumeric characters and ignoring case.",
    lambda s: (lambda t: t == t[::-1])([c.lower() for c in s if c.isalnum()]),
    [("A man, a plan, a canal: Panama",), ("race a car",), (" ",), ("0P",)])

reg("valid-anagram", "Valid anagram", "Strings", [("hashing/frequency", 1.0)], 1,
    "is_anagram", ("s, t", "pass"),
    "Return True if `t` is an anagram of `s`.",
    lambda s, t: sorted(s) == sorted(t),
    [("anagram", "nagaram"), ("rat", "car"), ("a", "ab"), ("listen", "silent")])

reg("first-unique-char", "First unique character", "Strings", [("hashing/frequency", 1.0), ("strings/traverse", 0.4)], 1,
    "first_uniq_char", ("s", "pass"),
    "Return the index of the first non-repeating character in `s`, or -1 if none.",
    lambda s: next((i for i, c in enumerate(s) if s.count(c) == 1), -1),
    [("leetcode",), ("loveleetcode",), ("aabb",), ("z",)])

reg("longest-common-prefix", "Longest common prefix", "Strings", [("strings/traverse", 1.0)], 2,
    "longest_common_prefix", ("strs", "pass"),
    "Return the longest common prefix string among an array of strings `strs`, or empty string.",
    lambda strs: (lambda f: f[:next((i for i in range(len(f)) if any(i >= len(w) or w[i] != f[i] for w in strs)), len(f))] if strs else "")(strs[0] if strs else ""),
    [(["flower", "flow", "flight"],), (["dog", "racecar", "car"],), (["interspecies", "interstellar", "interstate"],), (["a"],)])

# =================== Hashing ===================
reg("two-sum", "Two sum", "Hashing", [("hashing/lookup", 1.0), ("arrays/iterate", 0.5)], 1,
    "two_sum", ("nums, target", "pass"),
    "Return indices `[i, j]` (i < j) of the two numbers in `nums` that add to `target`. Exactly one solution.",
    lambda nums, target: (lambda seen: next([seen[target - n], i] for i, n in enumerate(nums) if (target - n in seen) or seen.update({n: i})))({}),
    [([2, 7, 11, 15], 9), ([3, 2, 4], 6), ([3, 3], 6), ([-1, -2, -3, -4, -5], -8)])

reg("contains-duplicate", "Contains duplicate", "Hashing", [("hashing/set-dedup", 1.0)], 1,
    "contains_duplicate", ("nums", "pass"),
    "Return True if any value appears at least twice in `nums`.",
    lambda nums: len(set(nums)) != len(nums),
    [([1, 2, 3, 1],), ([1, 2, 3, 4],), ([],), ([1, 1],)])

reg("majority-element", "Majority element", "Hashing", [("hashing/frequency", 1.0)], 1,
    "majority_element", ("nums", "pass"),
    "Return the element that appears more than n/2 times in `nums` (guaranteed to exist).",
    lambda nums: max(set(nums), key=nums.count),
    [([3, 2, 3],), ([2, 2, 1, 1, 1, 2, 2],), ([1],), ([5, 5, 5, 1, 2],)])

reg("group-anagrams", "Group anagrams", "Hashing", [("hashing/grouping", 1.0)], 2,
    "group_anagrams", ("strs", "pass"),
    "Group the strings that are anagrams of each other. Return a list of groups, each group sorted, and the list of groups sorted.",
    lambda strs: sorted([sorted(v) for v in _group(strs).values()]),
    [(["eat", "tea", "tan", "ate", "nat", "bat"],), (["", ""],), (["a"],), (["abc", "bca", "xyz"],)])

reg("subarray-sum-k", "Subarray sum equals K", "Hashing", [("hashing/frequency", 1.0), ("arrays/prefix-sum", 0.7)], 2,
    "subarray_sum", ("nums, k", "pass"),
    "Return the number of contiguous subarrays of `nums` whose sum equals `k`.",
    lambda nums, k: _subarray_sum(nums, k),
    [([1, 1, 1], 2), ([1, 2, 3], 3), ([1, -1, 0], 0), ([3, 4, 7, 2, -3, 1, 4, 2], 7)])

# =================== Two pointers ===================
reg("two-sum-sorted", "Two sum II (sorted)", "Two Pointers", [("two-pointers/convergent", 1.0)], 1,
    "two_sum_sorted", ("nums, target", "pass"),
    "Given an ascending `nums`, return 0-indexed `[i, j]` with i < j and nums[i] + nums[j] == target.",
    lambda nums, target: _two_ptr_sum(nums, target),
    [([2, 7, 11, 15], 9), ([2, 3, 4], 6), ([-1, 0], -1), ([1, 2, 3, 4, 4], 8)])

reg("is-subsequence", "Is subsequence", "Two Pointers", [("two-pointers/fast-slow", 1.0)], 1,
    "is_subsequence", ("s, t", "pass"),
    "Return True if `s` is a subsequence of `t` (characters in order, not necessarily contiguous).",
    lambda s, t: _is_subseq(s, t),
    [("abc", "ahbgdc"), ("axc", "ahbgdc"), ("", "abc"), ("ace", "abcde")])

reg("container-water", "Container with most water", "Two Pointers", [("two-pointers/convergent", 1.0)], 2,
    "max_area", ("height", "pass"),
    "Given vertical line heights, return the maximum water area between two lines.",
    lambda height: _max_area(height),
    [([1, 8, 6, 2, 5, 4, 8, 3, 7],), ([1, 1],), ([4, 3, 2, 1, 4],), ([1, 2, 1],)])

reg("three-sum", "3Sum", "Two Pointers", [("two-pointers/convergent", 1.0), ("greedy/sorting", 0.4)], 3,
    "three_sum", ("nums", "pass"),
    "Return all unique triplets `[a, b, c]` from `nums` that sum to zero. Each triplet sorted ascending; the list of triplets sorted.",
    lambda nums: _three_sum(nums),
    [([-1, 0, 1, 2, -1, -4],), ([0, 1, 1],), ([0, 0, 0],), ([-2, 0, 1, 1, 2],)])

# =================== Sliding window ===================
reg("max-window-sum", "Max window sum", "Sliding Window", [("sliding-window/fixed", 1.0), ("arrays/iterate", 0.4)], 2,
    "max_window_sum", ("nums, k", "pass"),
    "Return the maximum sum of any contiguous subarray of length exactly `k`.",
    lambda nums, k: max(sum(nums[i:i + k]) for i in range(len(nums) - k + 1)),
    [([2, 1, 5, 1, 3, 2], 3), ([2, 3, 4, 1, 5], 2), ([1, 1, 1, 1], 4), ([-1, -2, -3, -4], 2)])

reg("min-window-len", "Min window length", "Sliding Window", [("sliding-window/shrink", 1.0), ("sliding-window/expand", 0.6)], 3,
    "min_window_len", ("nums, target", "pass"),
    "Given positive `nums`, return the minimal length of a contiguous subarray with sum >= `target`, else 0.",
    lambda nums, target: _min_window(nums, target),
    [([2, 3, 1, 2, 4, 3], 7), ([1, 4, 4], 4), ([1, 1, 1, 1], 11), ([1, 2, 3, 4, 5], 11)])

reg("longest-no-repeat", "Longest substring no repeat", "Sliding Window", [("sliding-window/distinct", 1.0), ("hashing/lookup", 0.5)], 3,
    "length_of_longest", ("s", "pass"),
    "Return the length of the longest substring of `s` without repeating characters.",
    lambda s: _longest_no_repeat(s),
    [("abcabcbb",), ("bbbbb",), ("pwwkew",), ("",)])

reg("find-anagrams", "Find all anagrams", "Sliding Window", [("sliding-window/fixed", 1.0), ("hashing/frequency", 0.7)], 3,
    "find_anagrams", ("s, p", "pass"),
    "Return the start indices of all substrings of `s` that are anagrams of `p`.",
    lambda s, p: _find_anagrams(s, p),
    [("cbaebabacd", "abc"), ("abab", "ab"), ("aa", "bb"), ("af", "be")])

# =================== Binary search ===================
reg("binary-search", "Binary search", "Binary Search", [("binary-search/boundary", 1.0)], 2,
    "binary_search", ("nums, target", "pass"),
    "Return the index of `target` in the sorted `nums`, or -1.",
    lambda nums, target: _bsearch(nums, target),
    [([-1, 0, 3, 5, 9, 12], 9), ([-1, 0, 3, 5, 9, 12], 2), ([5], 5), ([1, 2, 3, 4, 5, 6, 7], 7)])

reg("search-insert", "Search insert position", "Binary Search", [("binary-search/insert", 1.0)], 1,
    "search_insert", ("nums, target", "pass"),
    "Return the index where `target` is, or where it would be inserted to keep `nums` sorted.",
    lambda nums, target: _bisect_left(nums, target),
    [([1, 3, 5, 6], 5), ([1, 3, 5, 6], 2), ([1, 3, 5, 6], 7), ([1, 3, 5, 6], 0)])

reg("sqrt-floor", "Integer square root", "Binary Search", [("binary-search/on-answer", 1.0), ("math/digits", 0.3)], 2,
    "my_sqrt", ("x", "pass"),
    "Return floor(sqrt(x)) for non-negative integer `x`, computed by binary search on the answer.",
    lambda x: int(__import__("math").isqrt(x)),
    [(4,), (8,), (0,), (2147395600,)])

reg("search-rotated", "Search in rotated array", "Binary Search", [("binary-search/rotated", 1.0)], 3,
    "search_rotated", ("nums, target", "pass"),
    "A sorted array was rotated at an unknown pivot. Return the index of `target`, or -1.",
    lambda nums, target: _search_rotated(nums, target),
    [([4, 5, 6, 7, 0, 1, 2], 0), ([4, 5, 6, 7, 0, 1, 2], 3), ([1], 0), ([5, 1, 3], 5)])

# =================== Stack / Queue ===================
reg("valid-parens", "Valid parentheses", "Stack", [("stack/lifo", 1.0)], 2,
    "is_valid", ("s", "pass"),
    "Return True if every bracket in `s` (of ()[]{}) is closed by the matching type in the correct order.",
    lambda s: _valid_parens(s),
    [("()[]{}",), ("(]",), ("([)]",), ("{[]}",)])

reg("eval-rpn", "Evaluate RPN", "Stack", [("stack/expression", 1.0)], 2,
    "eval_rpn", ("tokens", "pass"),
    "Evaluate the arithmetic expression in Reverse Polish Notation `tokens` (+ - * /, integer truncation toward zero).",
    lambda tokens: _eval_rpn(tokens),
    [(["2", "1", "+", "3", "*"],), (["4", "13", "5", "/", "+"],), (["3", "4", "-"],), (["10", "2", "/"],)])

reg("daily-temperatures", "Daily temperatures", "Stack", [("stack/monotonic", 1.0)], 2,
    "daily_temperatures", ("temps", "pass"),
    "For each day, return how many days until a warmer temperature, or 0 if none. Use a monotonic stack.",
    lambda temps: _daily_temps(temps),
    [([73, 74, 75, 71, 69, 72, 76, 73],), ([30, 40, 50, 60],), ([30, 60, 90],), ([90, 80, 70],)])

reg("next-greater", "Next greater element", "Stack", [("stack/monotonic", 1.0)], 2,
    "next_greater", ("nums", "pass"),
    "For each element return the next strictly greater element to its right, or -1. Use a monotonic stack.",
    lambda nums: _next_greater(nums),
    [([2, 1, 2, 4, 3],), ([1, 2, 3],), ([3, 2, 1],), ([5],)])

reg("sliding-window-max", "Sliding window maximum", "Queue", [("queue/monotonic", 1.0), ("sliding-window/fixed", 0.6)], 3,
    "max_sliding_window", ("nums, k", "pass"),
    "Return the maximum of each contiguous window of size `k` as you slide across `nums`.",
    lambda nums, k: _window_max(nums, k),
    [([1, 3, -1, -3, 5, 3, 6, 7], 3), ([1], 1), ([9, 8, 7, 6], 2), ([1, 2, 3, 4], 4)])

# =================== Linked list (array-modeled) ===================
reg("middle-node", "Middle of the list", "Linked List", [("linked-list/two-pointer", 1.0), ("two-pointers/fast-slow", 0.6)], 1,
    "middle_value", ("vals", "pass"),
    "The list is given as values `vals`. Return the value of the middle node (second middle if even length).",
    lambda vals: vals[len(vals) // 2],
    [([1, 2, 3, 4, 5],), ([1, 2, 3, 4, 5, 6],), ([7],), ([1, 2],)])

reg("merge-sorted-lists", "Merge two sorted lists", "Linked List", [("linked-list/merge", 1.0)], 1,
    "merge_two", ("a, b", "pass"),
    "Merge two ascending lists `a` and `b` (given as value arrays) into one sorted list and return it.",
    lambda a, b: sorted(a + b),
    [([1, 2, 4], [1, 3, 4]), ([], []), ([], [0]), ([1, 5, 9], [2, 3, 6])])

reg("remove-nth-end", "Remove nth from end", "Linked List", [("linked-list/two-pointer", 1.0)], 2,
    "remove_nth", ("vals, n", "pass"),
    "Remove the `n`-th node from the end of the list `vals` and return the resulting value array.",
    lambda vals, n: vals[: len(vals) - n] + vals[len(vals) - n + 1:],
    [([1, 2, 3, 4, 5], 2), ([1], 1), ([1, 2], 1), ([1, 2, 3], 3)])

# =================== Trees (nested-list) ===================
reg("max-depth", "Maximum depth", "Trees", [("trees/dfs", 1.0), ("recursion/recursive-case", 0.5)], 1,
    "max_depth", ("root", "pass"),
    "A binary tree is given as nested lists `[val, left, right]` or null. Return its maximum depth.",
    lambda root: _max_depth(root),
    [(T1,), (T2,), (None,), (tnode(1),)])

reg("tree-sum", "Sum of tree", "Trees", [("trees/dfs", 1.0)], 1,
    "tree_sum", ("root", "pass"),
    "Tree given as nested lists `[val, left, right]` or null. Return the sum of all node values.",
    lambda root: _tree_sum(root),
    [(T1,), (T2,), (None,), (tnode(5, tnode(-3), tnode(2)),)])

reg("invert-tree", "Invert binary tree", "Trees", [("trees/dfs", 1.0)], 1,
    "invert_tree", ("root", "pass"),
    "Tree given as nested lists `[val, left, right]` or null. Return the mirror-image tree in the same format.",
    lambda root: _invert(root),
    [(T2,), (tnode(4, tnode(2), tnode(7)),), (None,), (tnode(1, tnode(2), None),)])

reg("level-order", "Level order traversal", "Trees", [("trees/bfs", 1.0), ("queue/fifo", 0.6)], 2,
    "level_order", ("root", "pass"),
    "Tree as nested lists. Return values grouped by level, top to bottom, left to right.",
    lambda root: _level_order(root),
    [(T1,), (T2,), (None,), (tnode(1, None, tnode(2)),)])

reg("validate-bst", "Validate BST", "Trees", [("trees/bst", 1.0)], 3,
    "is_valid_bst", ("root", "pass"),
    "Tree as nested lists. Return True if it is a valid binary search tree (strict ordering).",
    lambda root: _is_bst(root, float("-inf"), float("inf")),
    [(BST1,), (BSTBAD,), (None,), (tnode(2, tnode(1), tnode(3)),)])

# =================== Heap ===================
reg("kth-largest", "Kth largest element", "Heap", [("heap/top-k", 1.0)], 2,
    "find_kth_largest", ("nums, k", "pass"),
    "Return the `k`-th largest element in `nums` (k is 1-indexed).",
    lambda nums, k: sorted(nums, reverse=True)[k - 1],
    [([3, 2, 1, 5, 6, 4], 2), ([3, 2, 3, 1, 2, 4, 5, 5, 6], 4), ([1], 1), ([7, 7, 7], 2)])

reg("top-k-frequent", "Top K frequent", "Heap", [("heap/top-k", 1.0), ("hashing/frequency", 0.7)], 2,
    "top_k_frequent", ("nums, k", "pass"),
    "Return the `k` most frequent elements in `nums`, sorted ascending in the returned list.",
    lambda nums, k: sorted([v for v, _ in __import__("collections").Counter(nums).most_common(k)]),
    [([1, 1, 1, 2, 2, 3], 2), ([1], 1), ([4, 4, 5, 5, 6], 2), ([7, 7, 8, 9, 9, 9], 1)])

reg("merge-k-lists", "Merge K sorted lists", "Heap", [("heap/k-way", 1.0)], 3,
    "merge_k", ("lists", "pass"),
    "Merge `k` ascending lists (given as a list of value arrays) into one sorted list.",
    lambda lists: sorted([x for lst in lists for x in lst]),
    [([[1, 4, 5], [1, 3, 4], [2, 6]],), ([],), ([[]],), ([[1], [0]],)])

# =================== Graph ===================
reg("bfs-order", "BFS traversal", "Graphs", [("graph/bfs", 1.0), ("graph/adjacency", 0.6)], 2,
    "bfs_order", ("adj, start", "pass"),
    "`adj` is an adjacency list (adj[i] = sorted neighbors). Return BFS visit order from `start`, exploring neighbors in ascending order.",
    lambda adj, start: _bfs(adj, start),
    [([[1, 2], [0, 3], [0, 3], [1, 2]], 0), ([[1], [0], []], 2), ([[]], 0), ([[1, 2], [2], [0]], 0)])

reg("dfs-order", "DFS traversal", "Graphs", [("graph/dfs", 1.0), ("graph/adjacency", 0.6)], 2,
    "dfs_order", ("adj, start", "pass"),
    "`adj` is an adjacency list (sorted neighbors). Return DFS preorder from `start`, visiting neighbors ascending.",
    lambda adj, start: _dfs(adj, start),
    [([[1, 2], [0, 3], [0, 3], [1, 2]], 0), ([[1], [0], []], 2), ([[]], 0), ([[1, 2], [2], [0]], 0)])

reg("num-islands", "Number of islands", "Graphs", [("graph/grid", 1.0)], 3,
    "num_islands", ("grid", "pass"),
    "`grid` is a matrix of 0/1. Return the number of islands (4-directionally connected groups of 1s).",
    lambda grid: _num_islands(grid),
    [([[1, 1, 0], [1, 0, 0], [0, 0, 1]],), ([[0]],), ([[1, 1], [1, 1]],), ([[1, 0, 1, 0, 1]],)])

reg("count-components", "Connected components", "Graphs", [("graph/union-find", 1.0)], 2,
    "count_components", ("n, edges", "pass"),
    "Given `n` nodes (0..n-1) and undirected `edges`, return the number of connected components.",
    lambda n, edges: _components(n, edges),
    [(5, [[0, 1], [1, 2], [3, 4]]), (5, [[0, 1], [1, 2], [2, 3], [3, 4]]), (3, []), (4, [[0, 1], [2, 3], [1, 3]])])

reg("topo-sort", "Topological order", "Graphs", [("graph/topo-sort", 1.0)], 3,
    "topo_order", ("n, edges", "pass"),
    "DAG with `n` nodes and directed `edges` [u, v] (u before v). Return a topological order; break ties by smallest node.",
    lambda n, edges: _topo(n, edges),
    [(4, [[0, 1], [0, 2], [1, 3], [2, 3]]), (2, [[1, 0]]), (3, []), (3, [[0, 1], [1, 2]])])

# =================== Backtracking ===================
reg("subsets", "Subsets", "Backtracking", [("backtracking/subsets", 1.0)], 2,
    "subsets", ("nums", "pass"),
    "Return all subsets of the distinct integers `nums`. Each subset sorted ascending; the list of subsets sorted.",
    lambda nums: sorted([sorted(c) for r in range(len(nums) + 1) for c in __import__("itertools").combinations(nums, r)]),
    [([1, 2, 3],), ([0],), ([],), ([1, 2],)])

reg("permutations", "Permutations", "Backtracking", [("backtracking/permute", 1.0)], 2,
    "permute", ("nums", "pass"),
    "Return all permutations of the distinct integers `nums`. Return the list of permutations sorted.",
    lambda nums: sorted([list(p) for p in __import__("itertools").permutations(nums)]),
    [([1, 2, 3],), ([0, 1],), ([1],), ([2, 3, 4],)])

reg("combinations", "Combinations", "Backtracking", [("backtracking/combine", 1.0)], 2,
    "combine", ("n, k", "pass"),
    "Return all combinations of `k` numbers chosen from 1..n. Each combination ascending; the list sorted.",
    lambda n, k: sorted([list(c) for c in __import__("itertools").combinations(range(1, n + 1), k)]),
    [(4, 2), (1, 1), (3, 3), (5, 1)])

reg("combination-sum", "Combination sum", "Backtracking", [("backtracking/constraint", 1.0)], 3,
    "combination_sum", ("candidates, target", "pass"),
    "Return unique combinations of `candidates` (each usable unlimited times) that sum to `target`. Each combo sorted; list sorted.",
    lambda candidates, target: _comb_sum(candidates, target),
    [([2, 3, 6, 7], 7), ([2, 3, 5], 8), ([2], 1), ([3, 5], 8)])

reg("generate-parens", "Generate parentheses", "Backtracking", [("backtracking/constraint", 1.0), ("recursion/recursive-case", 0.5)], 3,
    "generate_parenthesis", ("n", "pass"),
    "Return all well-formed parentheses strings using `n` pairs. Return the list sorted.",
    lambda n: _gen_parens(n),
    [(3,), (1,), (2,), (0,)])

# =================== Greedy / Intervals ===================
reg("best-time-stock", "Best time to buy/sell", "Greedy", [("greedy/reach", 1.0), ("arrays/iterate", 0.4)], 1,
    "max_profit", ("prices", "pass"),
    "Return the maximum profit from one buy then one later sell of `prices`, or 0.",
    lambda prices: _max_profit(prices),
    [([7, 1, 5, 3, 6, 4],), ([7, 6, 4, 3, 1],), ([1],), ([2, 4, 1, 7],)])

reg("jump-game", "Jump game", "Greedy", [("greedy/reach", 1.0)], 2,
    "can_jump", ("nums", "pass"),
    "Each value is the max jump length from that index. Return True if you can reach the last index.",
    lambda nums: _can_jump(nums),
    [([2, 3, 1, 1, 4],), ([3, 2, 1, 0, 4],), ([0],), ([2, 0, 0],)])

reg("merge-intervals", "Merge intervals", "Intervals", [("intervals/merge", 1.0), ("greedy/sorting", 0.5)], 2,
    "merge_intervals", ("intervals", "pass"),
    "Merge all overlapping intervals `[start, end]` and return the sorted list of merged intervals.",
    lambda intervals: _merge_intervals(intervals),
    [([[1, 3], [2, 6], [8, 10], [15, 18]],), ([[1, 4], [4, 5]],), ([[1, 4]],), ([[1, 4], [2, 3]],)])

reg("min-rooms", "Minimum meeting rooms", "Intervals", [("intervals/schedule", 1.0), ("heap/top-k", 0.4)], 3,
    "min_meeting_rooms", ("intervals", "pass"),
    "Given meeting intervals `[start, end]`, return the minimum number of rooms required.",
    lambda intervals: _min_rooms(intervals),
    [([[0, 30], [5, 10], [15, 20]],), ([[7, 10], [2, 4]],), ([],), ([[1, 5], [2, 6], [3, 7]],)])

# =================== DP ===================
reg("climb-stairs", "Climbing stairs", "DP 1D", [("dp/1d-linear", 1.0)], 2,
    "climb_stairs", ("n", "pass"),
    "Climb `n` steps taking 1 or 2 at a time. Return the number of distinct ways.",
    lambda n: _climb(n),
    [(2,), (3,), (5,), (1,)])

reg("house-robber", "House robber", "DP 1D", [("dp/1d-choice", 1.0)], 2,
    "rob", ("nums", "pass"),
    "You cannot rob two adjacent houses. Return the maximum money from `nums`.",
    lambda nums: _rob(nums),
    [([1, 2, 3, 1],), ([2, 7, 9, 3, 1],), ([],), ([5],)])

reg("coin-change", "Coin change", "DP 1D", [("dp/1d-choice", 1.0)], 3,
    "coin_change", ("coins, amount", "pass"),
    "Return the fewest number of `coins` summing to `amount`, or -1 if impossible.",
    lambda coins, amount: _coin_change(coins, amount),
    [([1, 2, 5], 11), ([2], 3), ([1], 0), ([2, 5, 10], 27)])

reg("lis", "Longest increasing subsequence", "DP 1D", [("dp/subsequence", 1.0)], 3,
    "length_of_lis", ("nums", "pass"),
    "Return the length of the longest strictly increasing subsequence of `nums`.",
    lambda nums: _lis(nums),
    [([10, 9, 2, 5, 3, 7, 101, 18],), ([0, 1, 0, 3, 2, 3],), ([7, 7, 7],), ([4, 10, 4, 3, 8, 9],)])

reg("word-break", "Word break", "DP 1D", [("dp/partition", 1.0), ("hashing/set-dedup", 0.4)], 3,
    "word_break", ("s, words", "pass"),
    "Return True if `s` can be segmented into a space-separated sequence of words from `words`.",
    lambda s, words: _word_break(s, words),
    [("leetcode", ["leet", "code"]), ("applepenapple", ["apple", "pen"]), ("catsandog", ["cats", "dog", "sand", "and", "cat"]), ("a", ["a"])])

reg("unique-paths", "Unique paths", "DP 2D", [("dp/grid", 1.0)], 2,
    "unique_paths", ("m, n", "pass"),
    "Return the number of distinct paths from top-left to bottom-right of an `m` x `n` grid moving only right or down.",
    lambda m, n: _unique_paths(m, n),
    [(3, 7), (3, 2), (1, 1), (4, 4)])

reg("min-path-sum", "Minimum path sum", "DP 2D", [("dp/grid", 1.0)], 2,
    "min_path_sum", ("grid", "pass"),
    "Return the minimum sum path from top-left to bottom-right of `grid`, moving right or down.",
    lambda grid: _min_path_sum(grid),
    [([[1, 3, 1], [1, 5, 1], [4, 2, 1]],), ([[1, 2, 3], [4, 5, 6]],), ([[5]],), ([[1, 2], [1, 1]],)])

reg("lcs", "Longest common subsequence", "DP 2D", [("dp/two-seq", 1.0)], 3,
    "lcs", ("a, b", "pass"),
    "Return the length of the longest common subsequence of strings `a` and `b`.",
    lambda a, b: _lcs(a, b),
    [("abcde", "ace"), ("abc", "abc"), ("abc", "def"), ("bsbininm", "jmjkbkjkv")])

reg("edit-distance", "Edit distance", "DP 2D", [("dp/two-seq", 1.0)], 4,
    "edit_distance", ("a, b", "pass"),
    "Return the minimum number of single-character insert/delete/replace edits to turn `a` into `b`.",
    lambda a, b: _edit_distance(a, b),
    [("horse", "ros"), ("intention", "execution"), ("", "abc"), ("abc", "abc")])

reg("knapsack", "0/1 knapsack", "DP 2D", [("dp/knapsack", 1.0)], 4,
    "knapsack", ("weights, values, cap", "pass"),
    "Each item has a weight and value. Return the max total value with total weight <= `cap`, each item used at most once.",
    lambda weights, values, cap: _knapsack(weights, values, cap),
    [([1, 3, 4, 5], [1, 4, 5, 7], 7), ([2, 2, 3], [3, 3, 5], 4), ([5], [10], 4), ([1, 2, 3], [6, 10, 12], 5)])

# =================== Bit / Math ===================
reg("single-number", "Single number", "Bit", [("bit/xor", 1.0)], 1,
    "single_number", ("nums", "pass"),
    "Every element appears twice except one. Return the single one using XOR.",
    lambda nums: __import__("functools").reduce(lambda a, b: a ^ b, nums),
    [([2, 2, 1],), ([4, 1, 2, 1, 2],), ([1],), ([7, 3, 7],)])

reg("count-bits", "Counting bits", "Bit", [("bit/count", 1.0)], 1,
    "count_bits", ("n", "pass"),
    "Return a list ans of length n+1 where ans[i] is the number of set bits in i.",
    lambda n: [bin(i).count("1") for i in range(n + 1)],
    [(2,), (5,), (0,), (8,)])

reg("missing-number", "Missing number", "Bit", [("bit/xor", 1.0), ("math/digits", 0.3)], 1,
    "missing_number", ("nums", "pass"),
    "`nums` contains n distinct numbers from 0..n with one missing. Return the missing number.",
    lambda nums: len(nums) * (len(nums) + 1) // 2 - sum(nums),
    [([3, 0, 1],), ([0, 1],), ([9, 6, 4, 2, 3, 5, 7, 0, 1],), ([0],)])

reg("gcd", "Greatest common divisor", "Math", [("math/gcd", 1.0)], 1,
    "compute_gcd", ("a, b", "pass"),
    "Return the greatest common divisor of `a` and `b` (Euclid).",
    lambda a, b: _gcd(a, b),
    [(12, 18), (7, 1), (100, 75), (17, 5)])

reg("count-primes", "Count primes", "Math", [("math/primes", 1.0)], 2,
    "count_primes", ("n", "pass"),
    "Return the number of primes strictly less than `n` (sieve of Eratosthenes).",
    lambda n: _count_primes(n),
    [(10,), (0,), (2,), (50,)])

reg("fizzbuzz", "Fizz buzz", "Math", [("math/modular", 1.0)], 1,
    "fizz_buzz", ("n", "pass"),
    "Return the Fizz Buzz sequence 1..n: 'Fizz' for multiples of 3, 'Buzz' for 5, 'FizzBuzz' for both, else the number as a string.",
    lambda n: _fizzbuzz(n),
    [(3,), (5,), (15,), (1,)])

reg("reverse-integer", "Reverse integer", "Math", [("math/digits", 1.0)], 2,
    "reverse_int", ("x", "pass"),
    "Reverse the digits of signed 32-bit integer `x`. Return 0 if the result overflows the 32-bit range.",
    lambda x: _reverse_int(x),
    [(123,), (-123,), (120,), (1534236469,)])

# =================== Trie ===================
reg("prefix-count", "Prefix counts", "Trie", [("trie/prefix", 1.0), ("hashing/lookup", 0.4)], 3,
    "prefix_counts", ("words, queries", "pass"),
    "For each prefix in `queries`, return how many of `words` start with it. Return the list of counts.",
    lambda words, queries: [sum(1 for w in words if w.startswith(q)) for q in queries],
    [(["apple", "app", "apricot", "banana"], ["app", "ap", "b", "c"]),
     (["a"], ["a", "b"]), (["x", "xy", "xyz"], ["xy"]), ([], ["a"])])

# =================== Recursion ===================
reg("factorial", "Factorial", "Recursion", [("recursion/base-case", 1.0), ("recursion/recursive-case", 0.6)], 1,
    "factorial", ("n", "pass"),
    "Return n! computed recursively. 0! = 1.",
    lambda n: __import__("math").factorial(n),
    [(0,), (1,), (5,), (10,)])

reg("fib", "Fibonacci", "Recursion", [("recursion/recursive-case", 1.0), ("dp/1d-linear", 0.5)], 1,
    "fib", ("n", "pass"),
    "Return the n-th Fibonacci number (fib(0)=0, fib(1)=1).",
    lambda n: _fib(n),
    [(2,), (5,), (10,), (0,)])

reg("pow-int", "Power (integer)", "Recursion", [("recursion/divide", 1.0)], 2,
    "power", ("base, exp", "pass"),
    "Return base raised to a non-negative integer `exp`, using fast (divide and conquer) exponentiation.",
    lambda base, exp: base ** exp,
    [(2, 10), (3, 0), (5, 3), (2, 1)])


# ============================================================ ref helpers
def _group(strs):
    d = {}
    for w in strs:
        d.setdefault("".join(sorted(w)), []).append(w)
    return d


def _subarray_sum(nums, k):
    seen, s, c = {0: 1}, 0, 0
    for n in nums:
        s += n
        c += seen.get(s - k, 0)
        seen[s] = seen.get(s, 0) + 1
    return c


def _two_ptr_sum(nums, target):
    l, r = 0, len(nums) - 1
    while l < r:
        t = nums[l] + nums[r]
        if t == target:
            return [l, r]
        if t < target:
            l += 1
        else:
            r -= 1
    return [-1, -1]


def _is_subseq(s, t):
    it = iter(t)
    return all(c in it for c in s)


def _max_area(h):
    l, r, best = 0, len(h) - 1, 0
    while l < r:
        best = max(best, (r - l) * min(h[l], h[r]))
        if h[l] < h[r]:
            l += 1
        else:
            r -= 1
    return best


def _three_sum(nums):
    nums = sorted(nums)
    res = set()
    for i in range(len(nums)):
        l, r = i + 1, len(nums) - 1
        while l < r:
            s = nums[i] + nums[l] + nums[r]
            if s == 0:
                res.add((nums[i], nums[l], nums[r]))
                l += 1
                r -= 1
            elif s < 0:
                l += 1
            else:
                r -= 1
    return sorted([list(t) for t in res])


def _min_window(nums, target):
    l, s, best = 0, 0, len(nums) + 1
    for r in range(len(nums)):
        s += nums[r]
        while s >= target:
            best = min(best, r - l + 1)
            s -= nums[l]
            l += 1
    return 0 if best == len(nums) + 1 else best


def _longest_no_repeat(s):
    seen, l, best = {}, 0, 0
    for r, c in enumerate(s):
        if c in seen and seen[c] >= l:
            l = seen[c] + 1
        seen[c] = r
        best = max(best, r - l + 1)
    return best


def _find_anagrams(s, p):
    from collections import Counter
    need, k, res = Counter(p), len(p), []
    win = Counter(s[:k])
    if win == need:
        res.append(0)
    for i in range(k, len(s)):
        win[s[i]] += 1
        win[s[i - k]] -= 1
        if win[s[i - k]] == 0:
            del win[s[i - k]]
        if win == need:
            res.append(i - k + 1)
    return res


def _bsearch(nums, target):
    lo, hi = 0, len(nums) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if nums[mid] == target:
            return mid
        if nums[mid] < target:
            lo = mid + 1
        else:
            hi = mid - 1
    return -1


def _bisect_left(nums, target):
    lo, hi = 0, len(nums)
    while lo < hi:
        mid = (lo + hi) // 2
        if nums[mid] < target:
            lo = mid + 1
        else:
            hi = mid
    return lo


def _search_rotated(nums, target):
    lo, hi = 0, len(nums) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if nums[mid] == target:
            return mid
        if nums[lo] <= nums[mid]:
            if nums[lo] <= target < nums[mid]:
                hi = mid - 1
            else:
                lo = mid + 1
        else:
            if nums[mid] < target <= nums[hi]:
                lo = mid + 1
            else:
                hi = mid - 1
    return -1


def _valid_parens(s):
    pairs = {")": "(", "]": "[", "}": "{"}
    st = []
    for ch in s:
        if ch in "([{":
            st.append(ch)
        else:
            if not st or st.pop() != pairs.get(ch, ""):
                return False
    return not st


def _eval_rpn(tokens):
    st = []
    for t in tokens:
        if t in "+-*/":
            b, a = st.pop(), st.pop()
            if t == "+":
                st.append(a + b)
            elif t == "-":
                st.append(a - b)
            elif t == "*":
                st.append(a * b)
            else:
                st.append(int(a / b))
        else:
            st.append(int(t))
    return st[0]


def _daily_temps(temps):
    res, st = [0] * len(temps), []
    for i, t in enumerate(temps):
        while st and temps[st[-1]] < t:
            j = st.pop()
            res[j] = i - j
        st.append(i)
    return res


def _next_greater(nums):
    res, st = [-1] * len(nums), []
    for i, n in enumerate(nums):
        while st and nums[st[-1]] < n:
            res[st.pop()] = n
        st.append(i)
    return res


def _window_max(nums, k):
    from collections import deque
    dq, res = deque(), []
    for i, n in enumerate(nums):
        while dq and nums[dq[-1]] <= n:
            dq.pop()
        dq.append(i)
        if dq[0] <= i - k:
            dq.popleft()
        if i >= k - 1:
            res.append(nums[dq[0]])
    return res


def _max_depth(root):
    if root is None:
        return 0
    return 1 + max(_max_depth(root[1]), _max_depth(root[2]))


def _tree_sum(root):
    if root is None:
        return 0
    return root[0] + _tree_sum(root[1]) + _tree_sum(root[2])


def _invert(root):
    if root is None:
        return None
    return [root[0], _invert(root[2]), _invert(root[1])]


def _level_order(root):
    if root is None:
        return []
    res, level = [], [root]
    while level:
        res.append([n[0] for n in level])
        level = [c for n in level for c in (n[1], n[2]) if c is not None]
    return res


def _is_bst(root, lo, hi):
    if root is None:
        return True
    if not (lo < root[0] < hi):
        return False
    return _is_bst(root[1], lo, root[0]) and _is_bst(root[2], root[0], hi)


def _bfs(adj, start):
    from collections import deque
    seen, order, q = {start}, [], deque([start])
    while q:
        u = q.popleft()
        order.append(u)
        for v in adj[u]:
            if v not in seen:
                seen.add(v)
                q.append(v)
    return order


def _dfs(adj, start):
    seen, order = set(), []

    def go(u):
        seen.add(u)
        order.append(u)
        for v in adj[u]:
            if v not in seen:
                go(v)

    go(start)
    return order


def _num_islands(grid):
    if not grid or not grid[0]:
        return 0
    rows, cols = len(grid), len(grid[0])
    seen = set()

    def sink(r, c):
        stack = [(r, c)]
        while stack:
            i, j = stack.pop()
            if 0 <= i < rows and 0 <= j < cols and grid[i][j] == 1 and (i, j) not in seen:
                seen.add((i, j))
                stack += [(i + 1, j), (i - 1, j), (i, j + 1), (i, j - 1)]

    count = 0
    for r in range(rows):
        for c in range(cols):
            if grid[r][c] == 1 and (r, c) not in seen:
                sink(r, c)
                count += 1
    return count


def _components(n, edges):
    parent = list(range(n))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    c = n
    for a, b in edges:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb
            c -= 1
    return c


def _topo(n, edges):
    import heapq
    indeg = [0] * n
    adj = [[] for _ in range(n)]
    for u, v in edges:
        adj[u].append(v)
        indeg[v] += 1
    h = [i for i in range(n) if indeg[i] == 0]
    heapq.heapify(h)
    order = []
    while h:
        u = heapq.heappop(h)
        order.append(u)
        for v in adj[u]:
            indeg[v] -= 1
            if indeg[v] == 0:
                heapq.heappush(h, v)
    return order


def _comb_sum(candidates, target):
    candidates = sorted(candidates)
    res = []

    def go(i, remain, path):
        if remain == 0:
            res.append(list(path))
            return
        for j in range(i, len(candidates)):
            if candidates[j] > remain:
                break
            path.append(candidates[j])
            go(j, remain - candidates[j], path)
            path.pop()

    go(0, target, [])
    return sorted(res)


def _gen_parens(n):
    res = []

    def go(s, o, c):
        if len(s) == 2 * n:
            res.append(s)
            return
        if o < n:
            go(s + "(", o + 1, c)
        if c < o:
            go(s + ")", o, c + 1)

    go("", 0, 0)
    return sorted(res)


def _max_profit(prices):
    lo, best = float("inf"), 0
    for p in prices:
        lo = min(lo, p)
        best = max(best, p - lo)
    return best


def _can_jump(nums):
    reach = 0
    for i, n in enumerate(nums):
        if i > reach:
            return False
        reach = max(reach, i + n)
    return True


def _merge_intervals(intervals):
    out = []
    for s, e in sorted(intervals):
        if out and s <= out[-1][1]:
            out[-1][1] = max(out[-1][1], e)
        else:
            out.append([s, e])
    return out


def _min_rooms(intervals):
    if not intervals:
        return 0
    starts = sorted(i[0] for i in intervals)
    ends = sorted(i[1] for i in intervals)
    rooms = mx = 0
    j = 0
    for s in starts:
        while ends[j] <= s:
            rooms -= 1
            j += 1
        rooms += 1
        mx = max(mx, rooms)
    return mx


def _climb(n):
    a, b = 1, 1
    for _ in range(n):
        a, b = b, a + b
    return a


def _rob(nums):
    prev = cur = 0
    for n in nums:
        prev, cur = cur, max(cur, prev + n)
    return cur


def _coin_change(coins, amount):
    INF = amount + 1
    dp = [0] + [INF] * amount
    for a in range(1, amount + 1):
        for c in coins:
            if c <= a:
                dp[a] = min(dp[a], dp[a - c] + 1)
    return dp[amount] if dp[amount] != INF else -1


def _lis(nums):
    import bisect
    tails = []
    for x in nums:
        i = bisect.bisect_left(tails, x)
        if i == len(tails):
            tails.append(x)
        else:
            tails[i] = x
    return len(tails)


def _word_break(s, words):
    wset = set(words)
    dp = [True] + [False] * len(s)
    for i in range(1, len(s) + 1):
        for j in range(i):
            if dp[j] and s[j:i] in wset:
                dp[i] = True
                break
    return dp[len(s)]


def _unique_paths(m, n):
    from math import comb
    return comb(m + n - 2, m - 1)


def _min_path_sum(grid):
    rows, cols = len(grid), len(grid[0])
    dp = [row[:] for row in grid]
    for r in range(rows):
        for c in range(cols):
            if r == 0 and c == 0:
                continue
            up = dp[r - 1][c] if r else float("inf")
            left = dp[r][c - 1] if c else float("inf")
            dp[r][c] += min(up, left)
    return dp[-1][-1]


def _lcs(a, b):
    dp = [[0] * (len(b) + 1) for _ in range(len(a) + 1)]
    for i in range(1, len(a) + 1):
        for j in range(1, len(b) + 1):
            dp[i][j] = dp[i - 1][j - 1] + 1 if a[i - 1] == b[j - 1] else max(dp[i - 1][j], dp[i][j - 1])
    return dp[-1][-1]


def _edit_distance(a, b):
    dp = [[0] * (len(b) + 1) for _ in range(len(a) + 1)]
    for i in range(len(a) + 1):
        dp[i][0] = i
    for j in range(len(b) + 1):
        dp[0][j] = j
    for i in range(1, len(a) + 1):
        for j in range(1, len(b) + 1):
            if a[i - 1] == b[j - 1]:
                dp[i][j] = dp[i - 1][j - 1]
            else:
                dp[i][j] = 1 + min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    return dp[-1][-1]


def _knapsack(weights, values, cap):
    dp = [0] * (cap + 1)
    for i in range(len(weights)):
        for w in range(cap, weights[i] - 1, -1):
            dp[w] = max(dp[w], dp[w - weights[i]] + values[i])
    return dp[cap]


def _count_primes(n):
    if n < 3:
        return 0
    sieve = [True] * n
    sieve[0] = sieve[1] = False
    for i in range(2, int(n ** 0.5) + 1):
        if sieve[i]:
            for j in range(i * i, n, i):
                sieve[j] = False
    return sum(sieve)


def _fizzbuzz(n):
    out = []
    for i in range(1, n + 1):
        if i % 15 == 0:
            out.append("FizzBuzz")
        elif i % 3 == 0:
            out.append("Fizz")
        elif i % 5 == 0:
            out.append("Buzz")
        else:
            out.append(str(i))
    return out


def _reverse_int(x):
    sign = -1 if x < 0 else 1
    r = sign * int(str(abs(x))[::-1])
    return r if -(2 ** 31) <= r <= 2 ** 31 - 1 else 0


def _fib(n):
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a


# ============================================================ editorial solutions
# Clean canonical solutions, shown in the in-app editorial (gated). Verified at build time against
# the same tests, so they are guaranteed correct. A curated subset; problems without an entry show
# an approach-only editorial in the app.
SOLUTIONS = {
    "running-sum": "def running_sum(nums):\n    out, s = [], 0\n    for x in nums:\n        s += x\n        out.append(s)\n    return out\n",
    "max-subarray": "def max_subarray(nums):\n    best = cur = nums[0]\n    for x in nums[1:]:\n        cur = max(x, cur + x)\n        best = max(best, cur)\n    return best\n",
    "move-zeroes": "def move_zeroes(nums):\n    return [x for x in nums if x != 0] + [0] * nums.count(0)\n",
    "two-sum": "def two_sum(nums, target):\n    seen = {}\n    for i, n in enumerate(nums):\n        if target - n in seen:\n            return [seen[target - n], i]\n        seen[n] = i\n",
    "contains-duplicate": "def contains_duplicate(nums):\n    return len(set(nums)) != len(nums)\n",
    "majority-element": "def majority_element(nums):\n    count = cand = 0\n    for x in nums:\n        if count == 0:\n            cand = x\n        count += 1 if x == cand else -1\n    return cand\n",
    "valid-palindrome": "def is_palindrome(s):\n    t = [c.lower() for c in s if c.isalnum()]\n    return t == t[::-1]\n",
    "valid-anagram": "def is_anagram(s, t):\n    return sorted(s) == sorted(t)\n",
    "reverse-string": "def reverse_string(s):\n    return s[::-1]\n",
    "two-sum-sorted": "def two_sum_sorted(nums, target):\n    l, r = 0, len(nums) - 1\n    while l < r:\n        t = nums[l] + nums[r]\n        if t == target:\n            return [l, r]\n        if t < target:\n            l += 1\n        else:\n            r -= 1\n    return [-1, -1]\n",
    "longest-no-repeat": "def length_of_longest(s):\n    seen = {}\n    l = best = 0\n    for r, c in enumerate(s):\n        if c in seen and seen[c] >= l:\n            l = seen[c] + 1\n        seen[c] = r\n        best = max(best, r - l + 1)\n    return best\n",
    "max-window-sum": "def max_window_sum(nums, k):\n    cur = sum(nums[:k])\n    best = cur\n    for i in range(k, len(nums)):\n        cur += nums[i] - nums[i - k]\n        best = max(best, cur)\n    return best\n",
    "binary-search": "def binary_search(nums, target):\n    lo, hi = 0, len(nums) - 1\n    while lo <= hi:\n        mid = (lo + hi) // 2\n        if nums[mid] == target:\n            return mid\n        if nums[mid] < target:\n            lo = mid + 1\n        else:\n            hi = mid - 1\n    return -1\n",
    "search-insert": "def search_insert(nums, target):\n    lo, hi = 0, len(nums)\n    while lo < hi:\n        mid = (lo + hi) // 2\n        if nums[mid] < target:\n            lo = mid + 1\n        else:\n            hi = mid\n    return lo\n",
    "valid-parens": "def is_valid(s):\n    pairs = {')': '(', ']': '[', '}': '{'}\n    st = []\n    for ch in s:\n        if ch in '([{':\n            st.append(ch)\n        elif not st or st.pop() != pairs[ch]:\n            return False\n    return not st\n",
    "climb-stairs": "def climb_stairs(n):\n    a, b = 1, 1\n    for _ in range(n):\n        a, b = b, a + b\n    return a\n",
    "house-robber": "def rob(nums):\n    prev = cur = 0\n    for n in nums:\n        prev, cur = cur, max(cur, prev + n)\n    return cur\n",
    "single-number": "def single_number(nums):\n    r = 0\n    for x in nums:\n        r ^= x\n    return r\n",
    "fizzbuzz": "def fizz_buzz(n):\n    out = []\n    for i in range(1, n + 1):\n        if i % 15 == 0:\n            out.append('FizzBuzz')\n        elif i % 3 == 0:\n            out.append('Fizz')\n        elif i % 5 == 0:\n            out.append('Buzz')\n        else:\n            out.append(str(i))\n    return out\n",
    "max-depth": "def max_depth(root):\n    if root is None:\n        return 0\n    return 1 + max(max_depth(root[1]), max_depth(root[2]))\n",
}


def verify_solution(src, func_name, tests):
    ns = {}
    try:
        exec(src, ns)
        f = ns.get(func_name)
        if f is None:
            return False
        for t in tests:
            if f(*copy.deepcopy(t["args"])) != t["expected"]:
                return False
        return True
    except Exception:
        return False


# ============================================================ build + emit
def build():
    items, errors = [], []
    for p in PROBS:
        tests = []
        for i, raw in enumerate(p["inputs"]):
            args = list(raw)
            try:
                val = p["ref"](*copy.deepcopy(args))
                json.dumps(val)  # serializable guard
            except Exception:
                errors.append((p["id"], i, traceback.format_exc().splitlines()[-1]))
                continue
            tests.append(dict(args=args, expected=val, hidden=(i >= p["visible"])))
        sol = SOLUTIONS.get(p["id"], "")
        if sol and not verify_solution(sol, p["funcName"], tests):
            errors.append((p["id"], -2, "editorial solution failed its own tests; dropped"))
            sol = ""
        items.append(dict(
            id=p["id"], title=p["title"], category=p["category"], difficulty=p["difficulty"],
            funcName=p["funcName"], starter=p["starter"], prompt=p["prompt"], solution=sol,
            kcs=[dict(slug=s, weight=w) for s, w in p["kcs"]], tests=tests,
        ))
    return items, errors


def main():
    os.makedirs(OUT, exist_ok=True)
    kcs = [dict(slug=s, title=t, category=c, depth=d, blurb=b) for (s, t, c, d, b) in KCS]
    edges = [dict(**{"from": a, "to": b}) for (a, b) in EDGES]
    items, errors = build()

    # integrity: every item KC and every edge endpoint must exist in the graph
    slugs = {k["slug"] for k in kcs}
    for it in items:
        for kc in it["kcs"]:
            if kc["slug"] not in slugs:
                errors.append((it["id"], -1, "unknown KC " + kc["slug"]))
    for e in edges:
        if e["from"] not in slugs or e["to"] not in slugs:
            errors.append(("edge", -1, "unknown endpoint " + e["from"] + "->" + e["to"]))

    with open(os.path.join(OUT, "kcs.json"), "w") as f:
        json.dump(kcs, f, indent=0)
    with open(os.path.join(OUT, "edges.json"), "w") as f:
        json.dump(edges, f, indent=0)
    with open(os.path.join(OUT, "bank.json"), "w") as f:
        json.dump(items, f, indent=0)

    cats = sorted({k["category"] for k in kcs})
    total_tests = sum(len(it["tests"]) for it in items)
    print("knowledge components : %d across %d categories" % (len(kcs), len(cats)))
    print("prerequisite edges   : %d" % len(edges))
    print("problems             : %d" % len(items))
    print("generated tests      : %d" % total_tests)
    print("categories           : %s" % ", ".join(cats))
    if errors:
        print("\nERRORS (%d):" % len(errors))
        for e in errors:
            print("  ", e)
    else:
        print("\nall references executed cleanly; every test computed from ground truth.")


if __name__ == "__main__":
    main()
