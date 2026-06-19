#include "engine/draw/gl_loader.hpp"

#include <array>
#include <utility>

const GLubyte* (APIENTRY* glGetString)(GLenum name) = nullptr;
void (APIENTRY* glViewport)(GLint x, GLint y, GLsizei width, GLsizei height) = nullptr;
void (APIENTRY* glClearColor)(GLfloat r, GLfloat g, GLfloat b, GLfloat a) = nullptr;
void (APIENTRY* glClear)(GLbitfield mask) = nullptr;
void (APIENTRY* glEnable)(GLenum cap) = nullptr;
void (APIENTRY* glDisable)(GLenum cap) = nullptr;
void (APIENTRY* glBlendFunc)(GLenum sfactor, GLenum dfactor) = nullptr;
void (APIENTRY* glGenVertexArrays)(GLsizei n, GLuint* arrays) = nullptr;
void (APIENTRY* glBindVertexArray)(GLuint array) = nullptr;
void (APIENTRY* glDeleteVertexArrays)(GLsizei n, const GLuint* arrays) = nullptr;
void (APIENTRY* glGenBuffers)(GLsizei n, GLuint* buffers) = nullptr;
void (APIENTRY* glBindBuffer)(GLenum target, GLuint buffer) = nullptr;
void (APIENTRY* glBufferData)(GLenum target, GLsizeiptr size, const void* data, GLenum usage) = nullptr;
void (APIENTRY* glBufferSubData)(GLenum target, std::ptrdiff_t offset, GLsizeiptr size, const void* data) = nullptr;
void (APIENTRY* glDeleteBuffers)(GLsizei n, const GLuint* buffers) = nullptr;
void (APIENTRY* glVertexAttribPointer)(GLuint index, GLint size, GLenum type, GLboolean normalized, GLsizei stride, const void* pointer) = nullptr;
void (APIENTRY* glEnableVertexAttribArray)(GLuint index) = nullptr;
void (APIENTRY* glDisableVertexAttribArray)(GLuint index) = nullptr;
void (APIENTRY* glDrawElements)(GLenum mode, GLsizei count, GLenum type, const void* indices) = nullptr;
GLuint (APIENTRY* glCreateShader)(GLenum type) = nullptr;
void (APIENTRY* glShaderSource)(GLuint shader, GLsizei count, const GLchar* const* string, const GLint* length) = nullptr;
void (APIENTRY* glCompileShader)(GLuint shader) = nullptr;
void (APIENTRY* glGetShaderiv)(GLuint shader, GLenum pname, GLint* params) = nullptr;
void (APIENTRY* glGetShaderInfoLog)(GLuint shader, GLsizei bufSize, GLsizei* length, GLchar* infoLog) = nullptr;
void (APIENTRY* glDeleteShader)(GLuint shader) = nullptr;
GLuint (APIENTRY* glCreateProgram)() = nullptr;
void (APIENTRY* glAttachShader)(GLuint program, GLuint shader) = nullptr;
void (APIENTRY* glLinkProgram)(GLuint program) = nullptr;
void (APIENTRY* glGetProgramiv)(GLuint program, GLenum pname, GLint* params) = nullptr;
void (APIENTRY* glGetProgramInfoLog)(GLuint program, GLsizei bufSize, GLsizei* length, GLchar* infoLog) = nullptr;
void (APIENTRY* glDeleteProgram)(GLuint program) = nullptr;
void (APIENTRY* glUseProgram)(GLuint program) = nullptr;
GLint (APIENTRY* glGetUniformLocation)(GLuint program, const GLchar* name) = nullptr;
void (APIENTRY* glUniform1f)(GLint location, GLfloat v0) = nullptr;
void (APIENTRY* glUniform1i)(GLint location, GLint v0) = nullptr;
void (APIENTRY* glUniform2f)(GLint location, GLfloat v0, GLfloat v1) = nullptr;
void (APIENTRY* glUniform4f)(GLint location, GLfloat v0, GLfloat v1, GLfloat v2, GLfloat v3) = nullptr;
void (APIENTRY* glUniformMatrix4fv)(GLint location, GLsizei count, GLboolean transpose, const GLfloat* value) = nullptr;
void (APIENTRY* glActiveTexture)(GLenum texture) = nullptr;
void (APIENTRY* glGenTextures)(GLsizei n, GLuint* textures) = nullptr;
void (APIENTRY* glBindTexture)(GLenum target, GLuint texture) = nullptr;
void (APIENTRY* glDeleteTextures)(GLsizei n, const GLuint* textures) = nullptr;
void (APIENTRY* glTexParameteri)(GLenum target, GLenum pname, GLint param) = nullptr;
void (APIENTRY* glTexImage2D)(GLenum target, GLint level, GLint internalformat, GLsizei width, GLsizei height, GLint border, GLenum format, GLenum type, const void* data) = nullptr;
void (APIENTRY* glTexSubImage2D)(GLenum target, GLint level, GLint xoffset, GLint yoffset, GLsizei width, GLsizei height, GLenum format, GLenum type, const void* data) = nullptr;
void (APIENTRY* glPixelStorei)(GLenum pname, GLint param) = nullptr;
void (APIENTRY* glReadPixels)(GLint x, GLint y, GLsizei width, GLsizei height, GLenum format, GLenum type, void* data) = nullptr;
void (APIENTRY* glGenFramebuffers)(GLsizei n, GLuint* framebuffers) = nullptr;
void (APIENTRY* glBindFramebuffer)(GLenum target, GLuint framebuffer) = nullptr;
void (APIENTRY* glFramebufferTexture2D)(GLenum target, GLenum attachment, GLenum textarget, GLuint texture, GLint level) = nullptr;
GLenum (APIENTRY* glCheckFramebufferStatus)(GLenum target) = nullptr;
void (APIENTRY* glDeleteFramebuffers)(GLsizei n, const GLuint* framebuffers) = nullptr;

namespace {

template <typename T>
bool load_symbol(GLLoadProc proc, T& out, const char* name) {
    out = reinterpret_cast<T>(proc(name));
    return out != nullptr;
}

} // namespace

bool load_gl_functions(GLLoadProc proc) {
    if (proc == nullptr) {
        return false;
    }

    bool ok = true;
    ok &= load_symbol(proc, glGetString, "glGetString");
    ok &= load_symbol(proc, glViewport, "glViewport");
    ok &= load_symbol(proc, glClearColor, "glClearColor");
    ok &= load_symbol(proc, glClear, "glClear");
    ok &= load_symbol(proc, glEnable, "glEnable");
    ok &= load_symbol(proc, glDisable, "glDisable");
    ok &= load_symbol(proc, glBlendFunc, "glBlendFunc");
    ok &= load_symbol(proc, glGenVertexArrays, "glGenVertexArrays");
    ok &= load_symbol(proc, glBindVertexArray, "glBindVertexArray");
    ok &= load_symbol(proc, glDeleteVertexArrays, "glDeleteVertexArrays");
    ok &= load_symbol(proc, glGenBuffers, "glGenBuffers");
    ok &= load_symbol(proc, glBindBuffer, "glBindBuffer");
    ok &= load_symbol(proc, glBufferData, "glBufferData");
    ok &= load_symbol(proc, glBufferSubData, "glBufferSubData");
    ok &= load_symbol(proc, glDeleteBuffers, "glDeleteBuffers");
    ok &= load_symbol(proc, glVertexAttribPointer, "glVertexAttribPointer");
    ok &= load_symbol(proc, glEnableVertexAttribArray, "glEnableVertexAttribArray");
    ok &= load_symbol(proc, glDisableVertexAttribArray, "glDisableVertexAttribArray");
    ok &= load_symbol(proc, glDrawElements, "glDrawElements");
    ok &= load_symbol(proc, glCreateShader, "glCreateShader");
    ok &= load_symbol(proc, glShaderSource, "glShaderSource");
    ok &= load_symbol(proc, glCompileShader, "glCompileShader");
    ok &= load_symbol(proc, glGetShaderiv, "glGetShaderiv");
    ok &= load_symbol(proc, glGetShaderInfoLog, "glGetShaderInfoLog");
    ok &= load_symbol(proc, glDeleteShader, "glDeleteShader");
    ok &= load_symbol(proc, glCreateProgram, "glCreateProgram");
    ok &= load_symbol(proc, glAttachShader, "glAttachShader");
    ok &= load_symbol(proc, glLinkProgram, "glLinkProgram");
    ok &= load_symbol(proc, glGetProgramiv, "glGetProgramiv");
    ok &= load_symbol(proc, glGetProgramInfoLog, "glGetProgramInfoLog");
    ok &= load_symbol(proc, glDeleteProgram, "glDeleteProgram");
    ok &= load_symbol(proc, glUseProgram, "glUseProgram");
    ok &= load_symbol(proc, glGetUniformLocation, "glGetUniformLocation");
    ok &= load_symbol(proc, glUniform1f, "glUniform1f");
    ok &= load_symbol(proc, glUniform1i, "glUniform1i");
    ok &= load_symbol(proc, glUniform2f, "glUniform2f");
    ok &= load_symbol(proc, glUniform4f, "glUniform4f");
    ok &= load_symbol(proc, glUniformMatrix4fv, "glUniformMatrix4fv");
    ok &= load_symbol(proc, glActiveTexture, "glActiveTexture");
    ok &= load_symbol(proc, glGenTextures, "glGenTextures");
    ok &= load_symbol(proc, glBindTexture, "glBindTexture");
    ok &= load_symbol(proc, glDeleteTextures, "glDeleteTextures");
    ok &= load_symbol(proc, glTexParameteri, "glTexParameteri");
    ok &= load_symbol(proc, glTexImage2D, "glTexImage2D");
    ok &= load_symbol(proc, glTexSubImage2D, "glTexSubImage2D");
    ok &= load_symbol(proc, glPixelStorei, "glPixelStorei");
    ok &= load_symbol(proc, glReadPixels, "glReadPixels");
    ok &= load_symbol(proc, glGenFramebuffers, "glGenFramebuffers");
    ok &= load_symbol(proc, glBindFramebuffer, "glBindFramebuffer");
    ok &= load_symbol(proc, glFramebufferTexture2D, "glFramebufferTexture2D");
    ok &= load_symbol(proc, glCheckFramebufferStatus, "glCheckFramebufferStatus");
    ok &= load_symbol(proc, glDeleteFramebuffers, "glDeleteFramebuffers");

    return ok;
}
