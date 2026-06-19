#pragma once

#include <cstddef>
#include <cstdint>

typedef unsigned int GLenum;
typedef unsigned char GLboolean;
typedef unsigned int GLbitfield;
typedef void GLvoid;
typedef std::int8_t GLbyte;
typedef std::uint8_t GLubyte;
typedef std::int16_t GLshort;
typedef std::uint16_t GLushort;
typedef std::int32_t GLint;
typedef std::uint32_t GLuint;
typedef std::int32_t GLsizei;
typedef std::ptrdiff_t GLsizeiptr;
typedef char GLchar;
typedef float GLfloat;

typedef void* (*GLLoadProc)(const char* name);

#ifndef APIENTRY
#if defined(_WIN32)
#define APIENTRY __stdcall
#else
#define APIENTRY
#endif
#endif

// Common constants used by the renderer.
constexpr GLbitfield GL_COLOR_BUFFER_BIT = 0x00004000;
constexpr GLenum GL_TEXTURE_2D = 0x0DE1;
constexpr GLenum GL_TEXTURE0 = 0x84C0;
constexpr GLenum GL_RGBA = 0x1908;
constexpr GLenum GL_UNSIGNED_BYTE = 0x1401;
constexpr GLenum GL_CLAMP_TO_EDGE = 0x812F;
constexpr GLenum GL_NEAREST = 0x2600;
constexpr GLenum GL_LINEAR = 0x2601;
constexpr GLenum GL_TEXTURE_MIN_FILTER = 0x2801;
constexpr GLenum GL_TEXTURE_MAG_FILTER = 0x2800;
constexpr GLenum GL_TEXTURE_WRAP_S = 0x2802;
constexpr GLenum GL_TEXTURE_WRAP_T = 0x2803;
constexpr GLenum GL_ARRAY_BUFFER = 0x8892;
constexpr GLenum GL_ELEMENT_ARRAY_BUFFER = 0x8893;
constexpr GLenum GL_DYNAMIC_DRAW = 0x88E8;
constexpr GLenum GL_STATIC_DRAW = 0x88E4;
constexpr GLenum GL_FLOAT = 0x1406;
constexpr GLenum GL_TRIANGLES = 0x0004;
constexpr GLenum GL_UNSIGNED_INT = 0x1405;
constexpr GLenum GL_BLEND = 0x0BE2;
constexpr GLenum GL_SRC_ALPHA = 0x0302;
constexpr GLenum GL_ONE = 1;
constexpr GLenum GL_ONE_MINUS_SRC_ALPHA = 0x0303;
constexpr GLenum GL_VERTEX_SHADER = 0x8B31;
constexpr GLenum GL_FRAGMENT_SHADER = 0x8B30;
constexpr GLenum GL_COMPILE_STATUS = 0x8B81;
constexpr GLenum GL_LINK_STATUS = 0x8B82;
constexpr GLenum GL_INFO_LOG_LENGTH = 0x8B84;
constexpr GLenum GL_DEPTH_TEST = 0x0B71;
constexpr GLenum GL_UNPACK_ALIGNMENT = 0x0CF5;
constexpr GLenum GL_FRAMEBUFFER = 0x8D40;
constexpr GLenum GL_COLOR_ATTACHMENT0 = 0x8CE0;
constexpr GLenum GL_FRAMEBUFFER_COMPLETE = 0x8CD5;
constexpr GLenum GL_PACK_ALIGNMENT = 0x0D05;
constexpr GLenum GL_FALSE_VALUE = 0;
constexpr GLenum GL_TRUE_VALUE = 1;

// GL function pointers
extern const GLubyte* (APIENTRY* glGetString)(GLenum name);
extern void (APIENTRY* glViewport)(GLint x, GLint y, GLsizei width, GLsizei height);
extern void (APIENTRY* glClearColor)(GLfloat r, GLfloat g, GLfloat b, GLfloat a);
extern void (APIENTRY* glClear)(GLbitfield mask);
extern void (APIENTRY* glEnable)(GLenum cap);
extern void (APIENTRY* glDisable)(GLenum cap);
extern void (APIENTRY* glBlendFunc)(GLenum sfactor, GLenum dfactor);
extern void (APIENTRY* glGenVertexArrays)(GLsizei n, GLuint* arrays);
extern void (APIENTRY* glBindVertexArray)(GLuint array);
extern void (APIENTRY* glDeleteVertexArrays)(GLsizei n, const GLuint* arrays);
extern void (APIENTRY* glGenBuffers)(GLsizei n, GLuint* buffers);
extern void (APIENTRY* glBindBuffer)(GLenum target, GLuint buffer);
extern void (APIENTRY* glBufferData)(GLenum target, GLsizeiptr size, const void* data, GLenum usage);
extern void (APIENTRY* glBufferSubData)(GLenum target, std::ptrdiff_t offset, GLsizeiptr size, const void* data);
extern void (APIENTRY* glDeleteBuffers)(GLsizei n, const GLuint* buffers);
extern void (APIENTRY* glVertexAttribPointer)(GLuint index, GLint size, GLenum type, GLboolean normalized, GLsizei stride, const void* pointer);
extern void (APIENTRY* glEnableVertexAttribArray)(GLuint index);
extern void (APIENTRY* glDisableVertexAttribArray)(GLuint index);
extern void (APIENTRY* glDrawElements)(GLenum mode, GLsizei count, GLenum type, const void* indices);
extern GLuint (APIENTRY* glCreateShader)(GLenum type);
extern void (APIENTRY* glShaderSource)(GLuint shader, GLsizei count, const GLchar* const* string, const GLint* length);
extern void (APIENTRY* glCompileShader)(GLuint shader);
extern void (APIENTRY* glGetShaderiv)(GLuint shader, GLenum pname, GLint* params);
extern void (APIENTRY* glGetShaderInfoLog)(GLuint shader, GLsizei bufSize, GLsizei* length, GLchar* infoLog);
extern void (APIENTRY* glDeleteShader)(GLuint shader);
extern GLuint (APIENTRY* glCreateProgram)();
extern void (APIENTRY* glAttachShader)(GLuint program, GLuint shader);
extern void (APIENTRY* glLinkProgram)(GLuint program);
extern void (APIENTRY* glGetProgramiv)(GLuint program, GLenum pname, GLint* params);
extern void (APIENTRY* glGetProgramInfoLog)(GLuint program, GLsizei bufSize, GLsizei* length, GLchar* infoLog);
extern void (APIENTRY* glDeleteProgram)(GLuint program);
extern void (APIENTRY* glUseProgram)(GLuint program);
extern GLint (APIENTRY* glGetUniformLocation)(GLuint program, const GLchar* name);
extern void (APIENTRY* glUniform1f)(GLint location, GLfloat v0);
extern void (APIENTRY* glUniform1i)(GLint location, GLint v0);
extern void (APIENTRY* glUniform2f)(GLint location, GLfloat v0, GLfloat v1);
extern void (APIENTRY* glUniform4f)(GLint location, GLfloat v0, GLfloat v1, GLfloat v2, GLfloat v3);
extern void (APIENTRY* glUniformMatrix4fv)(GLint location, GLsizei count, GLboolean transpose, const GLfloat* value);
extern void (APIENTRY* glActiveTexture)(GLenum texture);
extern void (APIENTRY* glGenTextures)(GLsizei n, GLuint* textures);
extern void (APIENTRY* glBindTexture)(GLenum target, GLuint texture);
extern void (APIENTRY* glDeleteTextures)(GLsizei n, const GLuint* textures);
extern void (APIENTRY* glTexParameteri)(GLenum target, GLenum pname, GLint param);
extern void (APIENTRY* glTexImage2D)(GLenum target, GLint level, GLint internalformat, GLsizei width, GLsizei height, GLint border, GLenum format, GLenum type, const void* data);
extern void (APIENTRY* glTexSubImage2D)(GLenum target, GLint level, GLint xoffset, GLint yoffset, GLsizei width, GLsizei height, GLenum format, GLenum type, const void* data);
extern void (APIENTRY* glPixelStorei)(GLenum pname, GLint param);
extern void (APIENTRY* glReadPixels)(GLint x, GLint y, GLsizei width, GLsizei height, GLenum format, GLenum type, void* data);
extern void (APIENTRY* glGenFramebuffers)(GLsizei n, GLuint* framebuffers);
extern void (APIENTRY* glBindFramebuffer)(GLenum target, GLuint framebuffer);
extern void (APIENTRY* glFramebufferTexture2D)(GLenum target, GLenum attachment, GLenum textarget, GLuint texture, GLint level);
extern GLenum (APIENTRY* glCheckFramebufferStatus)(GLenum target);
extern void (APIENTRY* glDeleteFramebuffers)(GLsizei n, const GLuint* framebuffers);

bool load_gl_functions(GLLoadProc proc);
