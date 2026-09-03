using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace Starfall.Core {

/// <summary>
/// A minimal JSON reader/writer.
///
/// Unity's JsonUtility cannot round-trip dictionaries, nested lists of objects
/// or nullable fields, all of which the save format needs — and a hand-rolled
/// reader can be unit-tested here, which JsonUtility cannot.
/// </summary>
public static class Json {

    // ------------------------------------------------------------- writing
    public sealed class Writer {
        readonly StringBuilder _sb = new StringBuilder();
        bool _needComma;

        public Writer BeginObject() { Comma(); _sb.Append('{'); _needComma = false; return this; }
        public Writer EndObject() { _sb.Append('}'); _needComma = true; return this; }
        public Writer BeginArray() { Comma(); _sb.Append('['); _needComma = false; return this; }
        public Writer EndArray() { _sb.Append(']'); _needComma = true; return this; }

        public Writer Key(string key) {
            Comma();
            _sb.Append('"').Append(Escape(key)).Append("\":");
            _needComma = false;
            return this;
        }

        public Writer Value(string v) {
            Comma();
            if (v == null) _sb.Append("null");
            else _sb.Append('"').Append(Escape(v)).Append('"');
            _needComma = true;
            return this;
        }
        public Writer Value(int v) { Comma(); _sb.Append(v.ToString(CultureInfo.InvariantCulture)); _needComma = true; return this; }
        public Writer Value(float v) { Comma(); _sb.Append(v.ToString("R", CultureInfo.InvariantCulture)); _needComma = true; return this; }
        public Writer Value(bool v) { Comma(); _sb.Append(v ? "true" : "false"); _needComma = true; return this; }

        public Writer Field(string key, string v) { Key(key); return Value(v); }
        public Writer Field(string key, int v) { Key(key); return Value(v); }
        public Writer Field(string key, float v) { Key(key); return Value(v); }
        public Writer Field(string key, bool v) { Key(key); return Value(v); }

        void Comma() { if (_needComma) _sb.Append(','); }
        public override string ToString() => _sb.ToString();
    }

    static string Escape(string s) {
        var sb = new StringBuilder(s.Length + 8);
        foreach (char c in s) {
            switch (c) {
                case '"': sb.Append("\\\""); break;
                case '\\': sb.Append("\\\\"); break;
                case '\n': sb.Append("\\n"); break;
                case '\r': sb.Append("\\r"); break;
                case '\t': sb.Append("\\t"); break;
                default:
                    if (c < ' ') sb.Append("\\u").Append(((int)c).ToString("x4"));
                    else sb.Append(c);
                    break;
            }
        }
        return sb.ToString();
    }

    // ------------------------------------------------------------- reading
    /// <summary>A parsed node: object, array, string, number, bool or null.</summary>
    public sealed class Node {
        public Dictionary<string, Node> Object;
        public List<Node> Array;
        public string Text;
        public double Number;
        public bool Bool;
        public bool IsNull;

        public bool IsObject => Object != null;
        public bool IsArray => Array != null;

        public Node this[string key] {
            get {
                Node n;
                return Object != null && Object.TryGetValue(key, out n) ? n : null;
            }
        }
        public Node this[int index] =>
            Array != null && index >= 0 && index < Array.Count ? Array[index] : null;

        public int Count => Array != null ? Array.Count : (Object != null ? Object.Count : 0);

        public string AsString(string fallback = null) => Text ?? fallback;
        public int AsInt(int fallback = 0) => IsNull ? fallback : (int)Number;
        public float AsFloat(float fallback = 0f) => IsNull ? fallback : (float)Number;
        public bool AsBool(bool fallback = false) => IsNull ? fallback : Bool;
    }

    public static Node Parse(string text) {
        if (string.IsNullOrEmpty(text)) return null;
        int i = 0;
        try {
            var node = ParseValue(text, ref i);
            return node;
        } catch (Exception) {
            return null;
        }
    }

    static void SkipWhitespace(string s, ref int i) {
        while (i < s.Length && (s[i] == ' ' || s[i] == '\t' || s[i] == '\n' || s[i] == '\r')) i++;
    }

    static Node ParseValue(string s, ref int i) {
        SkipWhitespace(s, ref i);
        if (i >= s.Length) throw new FormatException("unexpected end of JSON");
        char c = s[i];
        if (c == '{') return ParseObject(s, ref i);
        if (c == '[') return ParseArray(s, ref i);
        if (c == '"') return new Node { Text = ParseString(s, ref i) };
        if (c == 't') { Expect(s, ref i, "true"); return new Node { Bool = true, Number = 1 }; }
        if (c == 'f') { Expect(s, ref i, "false"); return new Node { Bool = false }; }
        if (c == 'n') { Expect(s, ref i, "null"); return new Node { IsNull = true }; }
        return ParseNumber(s, ref i);
    }

    static void Expect(string s, ref int i, string literal) {
        if (i + literal.Length > s.Length || string.CompareOrdinal(s, i, literal, 0, literal.Length) != 0)
            throw new FormatException("expected " + literal);
        i += literal.Length;
    }

    static Node ParseObject(string s, ref int i) {
        var node = new Node { Object = new Dictionary<string, Node>() };
        i++; // {
        SkipWhitespace(s, ref i);
        if (i < s.Length && s[i] == '}') { i++; return node; }
        while (i < s.Length) {
            SkipWhitespace(s, ref i);
            string key = ParseString(s, ref i);
            SkipWhitespace(s, ref i);
            if (i >= s.Length || s[i] != ':') throw new FormatException("expected ':'");
            i++;
            node.Object[key] = ParseValue(s, ref i);
            SkipWhitespace(s, ref i);
            if (i < s.Length && s[i] == ',') { i++; continue; }
            if (i < s.Length && s[i] == '}') { i++; return node; }
            throw new FormatException("expected ',' or '}'");
        }
        throw new FormatException("unterminated object");
    }

    static Node ParseArray(string s, ref int i) {
        var node = new Node { Array = new List<Node>() };
        i++; // [
        SkipWhitespace(s, ref i);
        if (i < s.Length && s[i] == ']') { i++; return node; }
        while (i < s.Length) {
            node.Array.Add(ParseValue(s, ref i));
            SkipWhitespace(s, ref i);
            if (i < s.Length && s[i] == ',') { i++; continue; }
            if (i < s.Length && s[i] == ']') { i++; return node; }
            throw new FormatException("expected ',' or ']'");
        }
        throw new FormatException("unterminated array");
    }

    static string ParseString(string s, ref int i) {
        if (s[i] != '"') throw new FormatException("expected string");
        i++;
        var sb = new StringBuilder();
        while (i < s.Length) {
            char c = s[i++];
            if (c == '"') return sb.ToString();
            if (c != '\\') { sb.Append(c); continue; }
            if (i >= s.Length) break;
            char e = s[i++];
            switch (e) {
                case '"': sb.Append('"'); break;
                case '\\': sb.Append('\\'); break;
                case '/': sb.Append('/'); break;
                case 'b': sb.Append('\b'); break;
                case 'f': sb.Append('\f'); break;
                case 'n': sb.Append('\n'); break;
                case 'r': sb.Append('\r'); break;
                case 't': sb.Append('\t'); break;
                case 'u':
                    if (i + 4 > s.Length) throw new FormatException("bad \\u escape");
                    sb.Append((char)Convert.ToInt32(s.Substring(i, 4), 16));
                    i += 4;
                    break;
                default: throw new FormatException("bad escape \\" + e);
            }
        }
        throw new FormatException("unterminated string");
    }

    static Node ParseNumber(string s, ref int i) {
        int start = i;
        if (i < s.Length && (s[i] == '-' || s[i] == '+')) i++;
        while (i < s.Length && ((s[i] >= '0' && s[i] <= '9') || s[i] == '.' ||
                                s[i] == 'e' || s[i] == 'E' || s[i] == '-' || s[i] == '+')) i++;
        string slice = s.Substring(start, i - start);
        double d;
        if (!double.TryParse(slice, NumberStyles.Float, CultureInfo.InvariantCulture, out d))
            throw new FormatException("bad number '" + slice + "'");
        return new Node { Number = d, Bool = d != 0 };
    }
}
}
