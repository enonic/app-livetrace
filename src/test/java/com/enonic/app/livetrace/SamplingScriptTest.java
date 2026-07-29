package com.enonic.app.livetrace;

import com.enonic.xp.testing.ScriptRunnerSupport;

public class SamplingScriptTest
    extends ScriptRunnerSupport
{
    @Override
    public String getScriptTestFile()
    {
        return "/test/sampling-test.js";
    }
}
