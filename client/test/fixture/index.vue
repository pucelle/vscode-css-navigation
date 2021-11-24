<style src="./css/test.scss"></style>
<style src="./node_modules/test-module/style-imported.scss"></style>

<style scoped>
    .test-vue-inner-class{
        color: red;
    }
</style>

<style scoped lang="css">
    .test-vue-inner-class-css{
        color: red;
    }
</style>

<style scoped lang="scss">
    .test-vue-inner-class{
        &-scss{
            color: red;
        }
    }
</style>

<style scoped lang="less">
    .test-vue-inner-class{
        &-less{
            color: red;
        }
    }
</style>

<template>
    <div class="test-vue-inner-class">Test Text</div>
    <div class="test-vue-inner-class-css">Test Text</div>
    <div class="test-vue-inner-class-scss">Test Text</div>
    <div class="test-vue-inner-class-less">Test Text</div>

    <div class="test-vue-import-class">Test Text</div>
    <div class="class-style-imported">Test Text</div>
</template>

