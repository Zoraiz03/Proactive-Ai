// Optional guards for explicit Fix Code verification. Normal Run commands are unchanged.
// Node synchronous load hooks: https://nodejs.org/api/module.html#moduleregisterhooksoptions
export function guardedRunArgs(language: 'python' | 'javascript', path: string, hash: string): string[] {
    if (language === 'python')
        return ['-c', `import sys, os, hashlib, types
p, expected = sys.argv[1], sys.argv[2]
data = open(p, 'rb').read()
if hashlib.sha256(data).hexdigest() != expected:
    raise RuntimeError('Source changed before execution. Run again after reviewing it.')
sys.argv = [p]
sys.path[0] = os.path.dirname(p)
os.write(3, expected.encode('ascii'))
module = types.ModuleType('__main__')
module.__file__, module.__spec__, module.__package__ = p, None, None
sys.modules['__main__'] = module
exec(compile(data, p, 'exec'), module.__dict__)
`, path, hash];
    const preload = `import {registerHooks} from 'node:module';import{createHash}from'node:crypto';import{writeSync,realpathSync}from'node:fs';import{pathToFileURL}from'node:url';const target=pathToFileURL(realpathSync(${JSON.stringify(path)})).href;registerHooks({load(url,ctx,next){const result=next(url,ctx);if(url===target){if(result.source==null||createHash('sha256').update(result.source).digest('hex')!==${JSON.stringify(hash)})throw Error('Source changed before execution. Review and run again.');writeSync(3,${JSON.stringify(hash)});}return result;}});`;
    return ['--import', `data:text/javascript,${encodeURIComponent(preload)}`, path];
}
